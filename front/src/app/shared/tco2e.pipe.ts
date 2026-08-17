import { Pipe, PipeTransform } from '@angular/core';

/**
 * Restitution d'une valeur exprimée en tCO₂e.
 *
 * <p>La précision s'adapte à l'ordre de grandeur : un poste à 0,003 tCO₂e ne
 * doit pas s'afficher « 0 », et un total à 3 782,59 tCO₂e n'a pas besoin de six
 * décimales. {@code Intl.NumberFormat} est préféré à {@code toFixed}, qui perd
 * les séparateurs de milliers et arrondit mal les grands nombres.</p>
 *
 * <p>Le garde-fou de plausibilité est la contrepartie du défaut qui portait le
 * tableau de bord à 3,78 milliards de tonnes : une valeur hors échelle est
 * signalée plutôt que présentée comme un résultat acquis.</p>
 */
@Pipe({ name: 'tco2e', standalone: true })
export class TCo2ePipe implements PipeTransform {

  /**
   * Seuil au-delà duquel une valeur ne peut plus documenter un site industriel.
   *
   * <p>Cent millions de tonnes dépassent l'empreinte annuelle de la plupart des
   * États : une telle valeur relève nécessairement d'une erreur d'unité.</p>
   */
  private static readonly SEUIL_INVRAISEMBLABLE = 1e8;

  transform(
    tonnes: number | null | undefined,
    options: { unite?: boolean; alerte?: boolean } = {}
  ): string {
    const { unite = true, alerte = true } = options;

    if (tonnes === null || tonnes === undefined || !Number.isFinite(tonnes)) {
      return unite ? '— tCO₂e' : '—';
    }

    const absolue = Math.abs(tonnes);

    // Décimales choisies par magnitude : la lisibilité prime sur l'uniformité.
    const decimales =
      absolue === 0 ? 0 :
      absolue < 0.01 ? 4 :
      absolue < 1 ? 3 :
      absolue < 10_000 ? 2 : 0;

    const rendu = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    }).format(tonnes);

    const suffixe = unite ? ' tCO₂e' : '';

    if (alerte && absolue > TCo2ePipe.SEUIL_INVRAISEMBLABLE) {
      return `⚠️ ${rendu}${suffixe} — ordre de grandeur à vérifier`;
    }

    return `${rendu}${suffixe}`;
  }
}
