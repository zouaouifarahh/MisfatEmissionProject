export interface EmissionSource {
  id?: number;
  referenceCode: string;
  scope: string;        // 'SCOPE_1', 'SCOPE_2', ou 'SCOPE_3'
  category: string;     // Ex: 'Combustion des véhicules'
  sourceName: string;   // Ex: 'Voiture à diesel moyenne'
  defaultUnit: string;  // Ex: 'L', 'kg', 'Km', 'kWh'
}