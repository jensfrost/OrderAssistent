import { apiGet } from './client';

export type Supplier = {
  supplierNumber: string;
  supplierName: string;
  raw?: any;
};

type RawSupplierRow = {
  data?: {
    adk_supplier_number?: string;
    adk_supplier_name?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

export async function fetchSuppliers(): Promise<Supplier[]> {
  const rows = await apiGet<RawSupplierRow[]>('suppliers');

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const data = row?.data ?? {};

      return {
        supplierNumber: String(data.adk_supplier_number ?? '').trim(),
        supplierName: String(data.adk_supplier_name ?? '').trim(),
        raw: row,
      };
    })
    .filter((row) => row.supplierNumber);
}