import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('compiled schedule/material/chat boundaries enforce role, Origin, nested DTOs and query allowlists without a database', async () => {
  const script = `
    import 'reflect-metadata';
    import assert from 'node:assert/strict';
    import { Test } from '@nestjs/testing';
    import { ConfigService } from '@nestjs/config';
    import { configureApp } from './dist/configure-app.js';
    import { AccessTokenGuard } from './dist/modules/auth/guards/access-token.guard.js';
    import { WeeklyScheduleController } from './dist/modules/classes/controllers/weekly-schedule.controller.js';
    import { WeeklyScheduleService } from './dist/modules/classes/services/weekly-schedule.service.js';
    import { ClassReadService } from './dist/modules/classes/services/class-read.service.js';
    import { MaterialRetentionController } from './dist/modules/materials/controllers/material-retention.controller.js';
    import { MaterialRetentionService } from './dist/modules/materials/services/material-retention.service.js';
    import { ChatAttachmentsController } from './dist/modules/chat/controllers/chat-attachments.controller.js';
    import { ChatAttachmentsService } from './dist/modules/chat/services/chat-attachments.service.js';
    const id='11111111-1111-4111-8111-111111111111';
    const module=await Test.createTestingModule({controllers:[WeeklyScheduleController,MaterialRetentionController,ChatAttachmentsController],providers:[
      {provide:ConfigService,useValue:new ConfigService({CORS_ORIGINS:'http://localhost:3001',SWAGGER_ENABLED:false})},
      {provide:WeeklyScheduleService,useValue:{preview:async()=>({sessions:[],conflicts:[]}),swap:async()=>({sessions:[],conflicts:[]})}},
      {provide:ClassReadService,useValue:{}},
      {provide:MaterialRetentionService,useValue:{opened:async()=>undefined,bulkDelete:async()=>({items:[]})}},
      {provide:ChatAttachmentsService,useValue:{sign:async(_a,_c,_m,disposition)=>({url:'https://files.example.test/'+disposition,expiresAt:'2026-11-05T00:00:00Z'})}},
    ]}).overrideGuard(AccessTokenGuard).useValue({canActivate(context){const req=context.switchToHttp().getRequest();req.user={userId:id,role:req.headers['x-test-role']??'MANAGER',sessionId:id};return true;}}).compile();
    const app=module.createNestApplication({bodyParser:false,logger:false});configureApp(app);await app.listen(0,'127.0.0.1');
    try{
      const base=await app.getUrl();
      async function post(path,body,role='MANAGER',origin='http://localhost:3001'){
        return fetch(base+'/api/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'x-test-role':role},body:JSON.stringify(body)});
      }
      const input={startDate:'2026-12-01',weeklySlots:[{weekday:1,slotId:2}],sessions:[{classUnitId:id,title:'Lesson'}],expectedVersion:1,reason:'Schedule'};
      const path='management/classes/'+id+'/weekly-schedule/preview';
      assert.equal((await post(path,input)).status,200);
      assert.equal((await post(path,{...input,weeklySlots:[{weekday:8,slotId:2}]})).status,422);
      assert.equal((await post(path,{...input,mentorId:id})).status,422);
      assert.equal((await post(path,input,'STUDENT')).status,403);
      assert.equal((await post(path,input,'MANAGER','https://foreign.test')).status,403);
      assert.equal((await post('materials/'+id+'/open',{classId:id,expectedRevision:1},'STUDENT')).status,204);
      assert.equal((await post('materials/'+id+'/open',{classId:id,expectedRevision:1},'MANAGER')).status,403);
      assert.equal((await post('manager/materials/bulk-delete',{items:Array.from({length:101},()=>({materialId:id,expectedRevision:1,lastSeenAt:null,trackingStartedAt:'2026-11-05T00:00:00Z'}))})).status,422);
      const image=await post('chat/conversations/'+id+'/messages/'+id+'/file-access?disposition=inline',undefined,'STUDENT');
      assert.equal(image.status,200);assert.equal((await image.json()).url,'https://files.example.test/inline');
      assert.equal((await post('chat/conversations/'+id+'/messages/'+id+'/file-access?disposition=script',undefined,'STUDENT')).status,422);
      console.log('COMPILED_CONTRACT_PASS');
    }finally{await app.close();}
  `;
  const result = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', script],
    { windowsHide: true, timeout: 30_000 },
  );
  expect(result.stdout).toContain('COMPILED_CONTRACT_PASS');
}, 35_000);
