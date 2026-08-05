export type PrintableOrderComponent = {
  id: string;

  name: string;

  section: string;

  quantity: number;

  isExternal: boolean;
};

export type PrintableOrderItem = {
  id: string;

  itemType: string;

  title: string;

  sellPrice: number;

  notes: string;

  components: PrintableOrderComponent[];
};

export type PrintableOrder = {
  id: number;

  branchId?: string | null;

  orderNumber: string;

  customerName: string;

  customerPhone: string;

  occasion: string;

  deliveryDate: string;

  deliveryTime: string;

  deliveryAddress: string;

  notes: string;

  productsTotal: number;

  deliveryFee: number;

  discount: number;

  total: number;

  paidAmount: number;

  remainingAmount: number;

  cashAmount: number;

  bankAmount: number;

  transferAmount: number;

  depositAmount: number;

  paymentMethod: string;

  deliveryPaymentMethod: string;

  deliveryStatus: string;

  deliveryDriverName: string;

  deliveryCompanyName: string;

  status: string;

  createdAt: string;

  items: PrintableOrderItem[];
};

export type PrintMode =
  | "customer"
  | "production"
  | "both";