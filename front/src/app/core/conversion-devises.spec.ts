import { describe, it, expect } from 'vitest';

import {
  coursALaDate, convertirMontant, emissionsMonetaires,
  ecartMillesime, messageMillesime, TauxChange, DEVISE_PIVOT
} from './conversion-devises';

/**
 * Conversion monétaire : le cours de l'époque, ou rien.
 *
 * <p>La panne que ce banc prévient est silencieuse : appliquer un facteur en
 * euros à un montant en dinars donne un nombre plausible et faux d'un facteur
 * trois. La seconde, plus insidieuse, est de convertir un exercice clos au
 * cours du jour — les émissions de 2023 se mettent alors à bouger chaque
 * matin.</p>
 */
describe('Conversion monétaire', () => {

  /** Cours tels que la base MISFAT les porte : rien avant 2024. */
  const cours = (): TauxChange[] => ([
    { code: 'EUR', rate: 3.30, validFrom: '2024-01-01', validTo: '2024-12-31' },
    { code: 'EUR', rate: 3.42, validFrom: '2025-01-01', validTo: null },
    { code: 'USD', rate: 3.10, validFrom: '2024-01-01', validTo: '2024-12-31' },
    { code: 'USD', rate: 2.95, validFrom: '2025-01-01', validTo: null }
  ]);

  describe('choix du cours', () => {

    it('retient le cours en vigueur à la date demandée', () => {
      expect(coursALaDate('EUR', '2024-06-15', cours())?.rate).toBe(3.30);
      expect(coursALaDate('EUR', '2025-06-15', cours())?.rate).toBe(3.42);
    });

    it('respecte les bornes de validité', () => {
      expect(coursALaDate('EUR', '2024-01-01', cours())?.rate).toBe(3.30);
      expect(coursALaDate('EUR', '2024-12-31', cours())?.rate).toBe(3.30);
      expect(coursALaDate('EUR', '2025-01-01', cours())?.rate).toBe(3.42);
    });

    it('ne trouve rien avant la première publication', () => {
      // La base ne porte aucun cours avant 2024 : les exercices 2022 et 2023
      // sont concernés, et il faut que cela se voie.
      expect(coursALaDate('EUR', '2023-06-15', cours())).toBeNull();
    });

    it('écarte un cours nul ou absent plutôt que de diviser par zéro', () => {
      const abimes: TauxChange[] = [
        { code: 'GBP', rate: 0, validFrom: '2024-01-01', validTo: null },
        { code: 'CHF', rate: null, validFrom: '2024-01-01', validTo: null }
      ];

      expect(coursALaDate('GBP', '2024-06-15', abimes)).toBeNull();
      expect(coursALaDate('CHF', '2024-06-15', abimes)).toBeNull();
    });

    it('reconnaît la devise quelle qu\'en soit la casse', () => {
      expect(coursALaDate('eur', '2024-06-15', cours())?.rate).toBe(3.30);
      expect(coursALaDate(' EUR ', '2024-06-15', cours())?.rate).toBe(3.30);
    });
  });

  describe('conversion d\'un montant', () => {

    it('ne touche pas à un montant déjà dans la bonne devise', () => {
      const r = convertirMontant(1_000, 'TND', 'TND', '2024-06-15', cours());

      expect(r.statut).toBe('IDENTIQUE');
      expect(r.montant).toBe(1_000);
    });

    it('convertit vers le pivot au cours de la date', () => {
      const r = convertirMontant(1_000, 'EUR', 'TND', '2024-06-15', cours());

      expect(r.statut).toBe('CONVERTI');
      expect(r.montant).toBeCloseTo(3_300, 6);
    });

    it('convertit depuis le pivot', () => {
      const r = convertirMontant(3_300, 'TND', 'EUR', '2024-06-15', cours());

      expect(r.statut).toBe('CONVERTI');
      expect(r.montant).toBeCloseTo(1_000, 6);
    });

    it('passe par le pivot pour un couple sans cours croisé', () => {
      // EUR → USD : 1 000 € = 3 300 TND = 3 300 / 3,10 USD.
      const r = convertirMontant(1_000, 'EUR', 'USD', '2024-06-15', cours());

      expect(r.statut).toBe('CONVERTI');
      expect(r.montant).toBeCloseTo(3_300 / 3.10, 6);
    });

    it('suit le cours de l\'exercice, non celui du jour', () => {
      // Sans cela, la variation du dinar déplacerait des émissions d'exercices
      // déjà clos.
      const en2024 = convertirMontant(1_000, 'EUR', 'TND', '2024-06-15', cours());
      const en2025 = convertirMontant(1_000, 'EUR', 'TND', '2025-06-15', cours());

      expect(en2024.montant).toBeCloseTo(3_300, 6);
      expect(en2025.montant).toBeCloseTo(3_420, 6);
    });

    it('traite l\'absence de devise comme le dinar', () => {
      const r = convertirMontant(1_000, null, undefined, '2024-06-15', cours());

      expect(r.statut).toBe('IDENTIQUE');
      expect(r.devise).toBe(DEVISE_PIVOT);
    });
  });

  describe('cours introuvable', () => {

    it('conserve le montant et le signale plutôt que de replier sur le jour', () => {
      const r = convertirMontant(1_000, 'EUR', 'TND', '2023-06-15', cours());

      expect(r.statut).toBe('TAUX_ABSENT');
      expect(r.montant).toBe(1_000);
      expect(r.avertissement).toContain('2023-06-15');
    });

    it('distingue une devise inconnue d\'une date non couverte', () => {
      const inconnue = convertirMontant(1_000, 'JPY', 'TND', '2024-06-15', cours());

      expect(inconnue.statut).toBe('DEVISE_INCONNUE');
      expect(inconnue.avertissement).toContain('JPY');
    });

    it('signale aussi une cible sans cours', () => {
      const r = convertirMontant(1_000, 'TND', 'GBP', '2024-06-15', cours());

      expect(r.statut).toBe('DEVISE_INCONNUE');
      expect(r.montant).toBe(1_000);
    });
  });

  describe('émissions d\'une dépense', () => {

    it('réconcilie les devises avant de multiplier', () => {
      // Facteur en euros, dépense en dinars : sans réconciliation, le calcul
      // multiplie des unités qui ne se répondent pas.
      const r = emissionsMonetaires(3_300, 'TND', 0.42, 'EUR', '2024-06-15', cours());

      expect(r.fiable).toBe(true);
      expect(r.emissions).toBeCloseTo(1_000 * 0.42, 6);
    });

    it('multiplie directement quand les devises coïncident', () => {
      const r = emissionsMonetaires(1_000, 'TND', 0.31, 'TND', '2024-06-15', cours());

      expect(r.emissions).toBeCloseTo(310, 6);
      expect(r.conversion.statut).toBe('IDENTIQUE');
    });

    it('marque le résultat non fiable quand le cours manque', () => {
      // Le chiffre reste calculé — il faut bien afficher quelque chose — mais
      // il est étiqueté, faute de quoi il partirait au rapport sans réserve.
      const r = emissionsMonetaires(3_300, 'TND', 0.42, 'EUR', '2023-06-15', cours());

      expect(r.fiable).toBe(false);
      expect(r.conversion.statut).toBe('TAUX_ABSENT');
    });
  });

  describe('millésime du facteur', () => {

    it('mesure l\'écart entre le facteur et la dépense', () => {
      expect(ecartMillesime(2021, 2026)).toBe(5);
      expect(ecartMillesime(2026, 2021)).toBe(-5);
      expect(ecartMillesime(2024, 2024)).toBe(0);
    });

    it('ne prétend rien sans millésime', () => {
      expect(ecartMillesime(null, 2026)).toBeNull();
      expect(ecartMillesime(2021, undefined)).toBeNull();
    });

    it('se tait en deçà de deux ans d\'écart', () => {
      // Un avertissement sur chaque ligne ne serait plus lu.
      expect(messageMillesime(0)).toBe('');
      expect(messageMillesime(1)).toBe('');
      expect(messageMillesime(null)).toBe('');
    });

    it('avertit au-delà, en nommant le sens de l\'écart', () => {
      expect(messageMillesime(5)).toContain('antérieur de 5 ans');
      expect(messageMillesime(-3)).toContain('postérieur de 3 ans');
    });
  });
});
