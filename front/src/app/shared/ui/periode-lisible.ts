/**
 * Période d'une mesure, rendue lisible dans un tableau.
 *
 * <p>Les dates sont saisies par un champ `type="date"` et conservées au format
 * ISO — « 2025-03-01 ». Le tableau les présente en écriture française.</p>
 *
 * <p>Le formatage est fait ici plutôt que par le pipe `date` d'Angular : celui-ci
 * réclame des données de locale que l'application n'enregistre pas, et vide la
 * cellule au lieu de la formater. Découper la chaîne ISO ne demande aucune
 * locale et ne peut pas échouer sur un fuseau horaire.</p>
 */

/** Une date ISO en écriture française ; chaîne vide si elle manque. */
function enFrancais(iso: string | null | undefined): string {
  const trouve = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '').trim());
  return trouve ? `${trouve[3]}/${trouve[2]}/${trouve[1]}` : '';
}

/**
 * Période d'une ligne, telle que la colonne « Période » l'affiche.
 *
 * <p>Une période absente rend un tiret plutôt qu'une chaîne vide : la cellule
 * dit alors que la donnée manque, au lieu de laisser croire à un défaut
 * d'affichage. C'est ce qui distingue une ligne à compléter d'une ligne
 * cassée.</p>
 *
 * <p>Une seule des deux bornes renseignée est rendue seule : une période
 * ouverte reste une information, et la compléter d'office lui prêterait une
 * borne que personne n'a saisie.</p>
 */
export function periodeLisible(ligne: { dateDebut?: string; dateFin?: string } | null): string {
  const debut = enFrancais(ligne?.dateDebut);
  const fin = enFrancais(ligne?.dateFin);

  if (debut && fin) return `${debut} – ${fin}`;
  return debut || fin || '—';
}
