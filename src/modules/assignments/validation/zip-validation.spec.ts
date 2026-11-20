import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zipBuffer } from '../../../../test/helpers/files-fixture.js';
import { validateZip } from './zip-validation.js';

describe('Assignment ZIP streamed validation', () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mindy-assignment-zip-test-'));
  });
  afterAll(async () => {
    if (resolve(directory).startsWith(resolve(tmpdir()) + sep))
      await rm(directory, { recursive: true, force: true });
  });
  async function validate(bytes: Buffer) {
    const path = join(directory, randomUUID());
    await writeFile(path, bytes);
    return validateZip(path);
  }
  it('accepts ordinary code/text/binary files without extracting them', async () => {
    await validate(
      await zipBuffer([
        ['src/main.ts', Buffer.from('console.log("hello");')],
        ['README.md', Buffer.from('Bài làm\nHướng dẫn')],
        ['data.bin', Buffer.from([1, 2, 3, 4])],
      ]),
    );
  });
  it('rejects spoofing, empty archives, nested archive signatures and archive suffixes', async () => {
    for (const bytes of [
      Buffer.from('fake ZIP'),
      await zipBuffer([]),
      await zipBuffer([['renamed.txt', await zipBuffer([['a.txt', Buffer.from('a')]])]]),
      await zipBuffer([['a.zip', Buffer.from('not even an archive')]]),
      await zipBuffer([['a.txt', Buffer.from([0x1f, 0x8b, 0, 0])]]),
    ])
      await expect(validate(bytes)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
  });
  it('rejects unsafe paths, duplicate normalized names and symlinks', async () => {
    const original = await zipBuffer([['safe.txt', Buffer.from('answer')]]);
    for (const name of ['../x.txt', '/bad.txt', 'C:/x.txt', 'bad\\.txt']) {
      const bytes = Buffer.from(original);
      for (let at = bytes.indexOf('safe.txt'); at >= 0; at = bytes.indexOf('safe.txt', at + 8))
        bytes.write(name, at, 'utf8');
      await expect(validate(bytes)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
    }
    await expect(
      validate(
        await zipBuffer([
          ['A.txt', Buffer.from('a')],
          ['a.txt', Buffer.from('b')],
        ]),
      ),
    ).rejects.toMatchObject({ code: 'ZIP_INVALID' });
    await expect(validate(await zipBuffer([['CON.txt', Buffer.from('a')]]))).rejects.toMatchObject({
      code: 'ZIP_INVALID',
    });
    const symlink = Buffer.from(original),
      central = symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    symlink.writeUInt32LE(0xa1ff0000, central + 38);
    await expect(validate(symlink)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
  });
  it('checks encryption, actual CRC and declared sizes', async () => {
    const original = await zipBuffer([['a.txt', Buffer.from('submitted answer')]]);
    const central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const encrypted = Buffer.from(original);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 1, 6);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
    const badCrc = Buffer.from(original);
    badCrc.writeUInt32LE(123, central + 16);
    const badSize = Buffer.from(original);
    badSize.writeUInt32LE(1, central + 24);
    for (const bytes of [encrypted, badCrc, badSize])
      await expect(validate(bytes)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
  });
  it('bounds compressed bytes, expansion ratio and entry count', async () => {
    await expect(validate(Buffer.alloc(20 * 1024 * 1024 + 1))).rejects.toMatchObject({
      code: 'ZIP_LIMIT_EXCEEDED',
    });
    await expect(
      validate(await zipBuffer([['bomb.txt', Buffer.alloc(1024 * 1024)]])),
    ).rejects.toMatchObject({ code: 'ZIP_LIMIT_EXCEEDED' });
    await expect(
      validate(
        await zipBuffer(
          Array.from({ length: 1001 }, (_, i) => [`${i}.txt`, Buffer.from('x')] as const),
        ),
      ),
    ).rejects.toMatchObject({ code: 'ZIP_LIMIT_EXCEEDED' });
  });
});
