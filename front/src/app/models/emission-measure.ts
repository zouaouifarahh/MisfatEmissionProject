export interface EmissionMeasure {
  id?: number;
  quantity: number;
  measureDate: string;
  totalCo2e?: number; // Calculé automatiquement par le backend Spring Boot
  emissionFactor: {
    id: number;
    scope?: string;
    category?: string;
    emissionSource?: string;
    factorValue?: number;
    unit?: string;
  };
}