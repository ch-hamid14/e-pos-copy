export enum ProductItemStatus {
  IN_STOCK = 'in_stock',
  RESERVED = 'reserved',
  SOLD = 'sold',
  RETURNED = 'returned',
  DAMAGED = 'damaged',
  IN_SERVICE = 'in_service'
}

export enum MovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  TRANSFER = 'TRANSFER',
  RETURN = 'RETURN',
  DAMAGE = 'DAMAGE',
  ADJUSTMENT = 'ADJUSTMENT'
}

export enum SaleStatus {
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK = 'bank',
  CARD = 'card',
  MIXED = 'mixed'
}

export enum LedgerEntryType {
  OPENING_BALANCE = 'opening_balance',
  SALE_DEBIT = 'sale_debit',
  PAYMENT_CREDIT = 'payment_credit',
  ADJUSTMENT = 'adjustment',
  /** Increases what we owe the supplier (AP). */
  PURCHASE_DEBIT = 'purchase_debit',
  /** Decreases AP when we pay the supplier. */
  SUPPLIER_PAYMENT_CREDIT = 'supplier_payment_credit'
}

export enum CompanyStatus {
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  INACTIVE = 'inactive'
}
