/**
 * Société consultée, lisible sans dépendre du service qui la choisit.
 *
 * <p>Le référentiel doit savoir depuis quelle société on le consulte : un
 * facteur saisi pour MISFAT Tunisie n'a pas à valoriser le bilan de MISFAT
 * Maroc. Mais le lui faire lire par injection de {@link EntityContextService}
 * revenait à faire dépendre toute lecture du référentiel d'un service qui
 * ouvre deux requêtes HTTP à sa construction — sociétés et exercices. Le
 * moindre appel au référentiel les déclenchait, y compris là où personne ne
 * les attendait.</p>
 *
 * <p>D'où ce relais sans dépendance : {@link EntityContextService} y écrit la
 * société retenue, les services la lisent. Un module et deux fonctions, aucune
 * injection, aucune entrée-sortie.</p>
 *
 * <p>{@code null} vaut consolidation groupe : aucune société n'est désignée,
 * et tout est lisible. C'est aussi l'état de départ, avant qu'un choix ait été
 * fait.</p>
 */
let societeRetenue: number | null = null;

/** Prend acte de la société consultée. Appelé par le contexte d'entité. */
export function definirSocieteCourante(entityId: number | null): void {
  societeRetenue = entityId;
}

/** Société consultée ; `null` en consolidation groupe. */
export function societeCourante(): number | null {
  return societeRetenue;
}
