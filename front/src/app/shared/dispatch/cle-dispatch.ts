/**
 * Identité de la répartition importée, sans dépendance.
 *
 * <p>La clé de stockage et la lecture du millésime vivaient dans
 * {@link ./dispatch-store}, avec le magasin. Les reprises de démarrage en ont
 * besoin, et les importer de là faisait entrer tout le magasin — donc le
 * référentiel, le service de change et leurs injections — dans le graphe du
 * noyau. Le module {@code core/perimetre-courant} s'y trouvait alors chargé
 * deux fois : les bancs remettaient à zéro la société consultée d'un côté,
 * pendant que le service la relisait de l'autre, et le référentiel se filtrait
 * sur une filiale que personne n'avait choisie.</p>
 *
 * <p>Ces deux valeurs n'ont besoin de rien : elles vivent donc seules, et le
 * magasin les réexporte pour que son interface publique ne bouge pas.</p>
 */

/** Clé de persistance de la répartition, relue à chaque démarrage. */
export const CLE_STOCKAGE = 'misfat_dispatched_lines';

/**
 * Exercice deviné du nom du classeur, à défaut de choix explicite.
 *
 * <p>« BG MISFAT 2025.xlsx » solde l'exercice 2025 : le nom du fichier le dit,
 * et c'est une donnée, non une déduction. Sans année dans le nom, rien n'est
 * rendu — inventer un exercice serait pire que de n'en proposer aucun.</p>
 */
export function exerciceDepuisNom(nom: string): number | null {
  const trouve = String(nom ?? '').match(/(20\d{2})/);
  if (!trouve) return null;

  const annee = Number(trouve[1]);
  return annee >= 2000 && annee <= 2100 ? annee : null;
}
