import { describe, it, expect } from 'vitest';

import { anneeDeDate, exercicesDeLaLigne, releveDeLExercice } from './perimetre';
import { periodeDeLExercice } from '../shared/dispatch/exercice-de-ligne';

/**
 * Rattachement d'une ligne à son exercice.
 *
 * <p>Le repli est documenté depuis toujours : « à défaut de période, la date de
 * création sert de rattachement ». Il n'a jamais fonctionné. Le lecteur
 * n'acceptait que l'écriture ISO, l'année en tête, alors que <strong>tous</strong>
 * les écrans horodatent leur création par le pipe `date` d'Angular, en écriture
 * française — « 15/03/2026 09:12 ».</p>
 *
 * <p>Une ligne sans période n'avait donc aucun exercice, et se trouvait écartée
 * de tout bilan daté quel que soit le millésime consulté. C'est ce qui laissait
 * un écran vide sous une bannière annonçant des milliers de lignes : elles
 * existaient, elles étaient comptées, et rien ne pouvait les afficher.</p>
 */
describe('Rattachement d\'une ligne à son exercice', () => {

  describe('lecture de l\'année', () => {

    it('lit l\'écriture ISO, l\'année en tête', () => {
      expect(anneeDeDate('2025-03-15')).toBe(2025);
    });

    it('lit l\'horodatage français que posent les écrans', () => {
      // Le cas qui manquait, et le seul que la donnee reelle presente.
      expect(anneeDeDate('15/03/2026 09:12')).toBe(2026);
      expect(anneeDeDate('01/01/2025')).toBe(2025);
      expect(anneeDeDate('5-7-2024')).toBe(2024);
    });

    it('ne lève pas un millésime sur deux chiffres', () => {
      // « 15/03/26 » se lirait aussi bien 1926 que 2026 : trancher daterait la
      // ligne au juge.
      expect(anneeDeDate('15/03/26')).toBeNull();
    });

    it('ne rend rien sur une valeur qui ne documente aucune date', () => {
      expect(anneeDeDate('')).toBeNull();
      expect(anneeDeDate(null)).toBeNull();
      expect(anneeDeDate('Achats de matières')).toBeNull();
    });

    it('écarte une année hors des bornes plausibles', () => {
      expect(anneeDeDate('15/03/1850')).toBeNull();
    });
  });

  describe('repli sur la date de création', () => {

    it('rattache une ligne sans période à son année de création', () => {
      const ligne = { dateDebut: '', dateFin: '', creeLe: '15/03/2026 09:12' };

      expect(exercicesDeLaLigne(ligne)).toEqual([2026]);
      expect(releveDeLExercice(ligne, 2026)).toBe(true);
    });

    it('la rend enfin visible, là où elle ne l\'était sur aucun exercice', () => {
      // Avant, `exercicesDeLaLigne` rendait une liste vide et la ligne
      // disparaissait de tous les bilans dates.
      const ligne = { dateDebut: '', dateFin: '', creeLe: '20/11/2025 14:03' };

      expect(exercicesDeLaLigne(ligne)).not.toHaveLength(0);
      expect(releveDeLExercice(ligne, 2025)).toBe(true);
      expect(releveDeLExercice(ligne, 2026)).toBe(false);
    });

    it('laisse la période saisie primer sur la création', () => {
      const ligne = {
        dateDebut: '2025-01-01', dateFin: '2025-12-31', creeLe: '15/03/2026 09:12'
      };

      expect(exercicesDeLaLigne(ligne)).toEqual([2025]);
      expect(releveDeLExercice(ligne, 2026)).toBe(false);
    });
  });

  describe('période posée à l\'import', () => {

    it('couvre l\'exercice entier', () => {
      expect(periodeDeLExercice(2025))
        .toEqual({ dateDebut: '2025-01-01', dateFin: '2025-12-31' });
    });

    it('rattache la ligne importée à cet exercice, et à lui seul', () => {
      const ligne = { ...periodeDeLExercice(2025), creeLe: '15/03/2026 09:12' };

      expect(releveDeLExercice(ligne, 2025)).toBe(true);
      expect(releveDeLExercice(ligne, 2026)).toBe(false);
    });

    it('ne pose rien en vue pluriannuelle', () => {
      // Sans exercice consulte, aucune periode n'est decidee : la ligne
      // retombera sur sa date de creation, faute de mieux.
      expect(periodeDeLExercice(null)).toEqual({ dateDebut: '', dateFin: '' });
    });
  });
});
