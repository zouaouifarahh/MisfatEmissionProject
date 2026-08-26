import { beforeEach } from 'vitest';

/**
 * Remise à zéro du stockage du navigateur avant chaque test.
 *
 * <p>Une bonne moitié des écrans relit ses lignes du stockage local à sa
 * construction — les vingt écrans de collecte, la répartition comptable, les
 * paramètres du rapport. Un test qui monte un de ces composants dépend donc de
 * ce que le stockage contient au moment où il s'exécute.</p>
 *
 * <p>Les fichiers de test s'en gardaient chacun de leur côté, par un
 * {@code localStorage.clear()} en tête de leur propre {@code beforeEach}. Une
 * quinzaine ne le faisaient pas, et rien ne les distinguait : tant que le
 * hasard de la répartition entre processus les tenait éloignés d'un fichier
 * écrivant dans le stockage, ils passaient. Ajouter un fichier de test
 * ailleurs dans le dépôt suffisait à changer cette répartition et à faire
 * échouer un écran que personne n'avait touché — deux fois de suite sur des
 * composants différents, pour des raisons identiques.</p>
 *
 * <p>La garantie est donc posée ici, une fois, pour tous les fichiers : chaque
 * test commence sur un stockage vide. Les {@code clear()} que les fichiers
 * portent déjà restent sans dommage — ils disent leur intention, et vider deux
 * fois ne coûte rien.</p>
 */
beforeEach(() => {
  // Un environnement sans DOM — un test de fonction pure — n'expose ni l'un ni
  // l'autre : les toucher y lèverait une exception avant le premier test.
  if (typeof localStorage !== 'undefined') localStorage.clear();
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});
