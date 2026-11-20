import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource, type EntityManager } from 'typeorm';

import { isUniqueViolation } from '../../../common/database/postgres-error.js';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import {
  type ClassOffer,
  ClassOffersService,
} from '../../classes/services/class-offers.service.js';
import { CART_MAX_ITEMS } from '../domain/checkout-plan.js';
import { CartEntity } from '../entities/cart.entity.js';
import { CartDetailEntity } from '../entities/cart-detail.entity.js';
import {
  CartItemAlreadyExistsException,
  CartItemNotFoundException,
  CartLimitExceededException,
} from '../exceptions/commerce.exceptions.js';

export interface CartItemView {
  readonly detail: CartDetailEntity;
  readonly offer: ClassOffer;
}

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly offersService: ClassOffersService,
  ) {}

  /** Reads the student's cart; a student who never added a class simply has no items. */
  async getCart(studentId: string): Promise<CartItemView[]> {
    return this.loadItems(this.dataSource.manager, studentId);
  }

  async addItem(studentId: string, classId: string): Promise<CartItemView[]> {
    const offer = await this.offersService.getVisibleOffer(classId);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const cart = await lockOrCreateCart(manager, studentId);
        const details = manager.getRepository(CartDetailEntity);
        const existing = await details.find({ where: { cartId: cart.id } });
        if (existing.some((detail) => detail.classId === classId)) {
          throw new CartItemAlreadyExistsException();
        }
        if (existing.length >= CART_MAX_ITEMS) {
          throw new CartLimitExceededException(CART_MAX_ITEMS);
        }

        // Advisory check for early feedback; checkout revalidates everything under locks.
        await this.offersService.assertPurchasable(studentId, [offer], manager);
        await details.insert({ cartId: cart.id, classId, priceSnapshot: offer.priceAmount });
        return this.loadItems(manager, studentId);
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error, 'uq_cart_details_cart_class')) {
        throw new CartItemAlreadyExistsException();
      }

      throw error;
    }
  }

  /** Deletes only the cart detail; orders are never affected. */
  async removeItem(studentId: string, classId: string): Promise<void> {
    const cart = await this.dataSource.getRepository(CartEntity).findOne({ where: { studentId } });
    if (cart === null) {
      throw new CartItemNotFoundException();
    }

    const result = await this.dataSource
      .getRepository(CartDetailEntity)
      .delete({ cartId: cart.id, classId });
    if ((result.affected ?? 0) === 0) {
      throw new CartItemNotFoundException();
    }
  }

  private async loadItems(manager: EntityManager, studentId: string): Promise<CartItemView[]> {
    const cart = await manager.getRepository(CartEntity).findOne({ where: { studentId } });
    if (cart === null) {
      return [];
    }

    const details = await manager.getRepository(CartDetailEntity).find({
      where: { cartId: cart.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const offers = await this.offersService.findOffers(
      details.map((detail) => detail.classId),
      manager,
    );
    const offersByClassId = new Map(offers.map((offer) => [offer.classId, offer]));

    return details.flatMap((detail) => {
      const offer = offersByClassId.get(detail.classId);
      return offer === undefined ? [] : [{ detail, offer }];
    });
  }
}

/**
 * Returns the student's cart locked for update, creating it on first use. The row lock
 * serializes concurrent cart changes and checkouts of the same student.
 */
export async function lockOrCreateCart(
  manager: EntityManager,
  studentId: string,
): Promise<CartEntity> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(CartEntity)
    .values({ studentId })
    .orIgnore()
    .execute();

  return manager
    .getRepository(CartEntity)
    .createQueryBuilder('cart')
    .setLock('pessimistic_write')
    .where('cart.studentId = :studentId', { studentId })
    .getOneOrFail();
}
