import { beforeEach } from 'vitest';

import { definirSocieteCourante } from './app/core/perimetre-courant';

/**
 * Rend le canevas muet, sans lui donner de contexte.
 *
 * <p>jsdom n'implémente pas {@code getContext} : chaque appel écrit une ligne
 * « Not implemented » sur la sortie d'erreur. Les écrans du tableau de bord
 * montent une dizaine de graphiques chacun, et depuis que les bancs servent
 * réellement les agrégats, une exécution complète en produit plusieurs
 * centaines. Ce flot a d'abord fait échouer un démontage — « Closing rpc while
 * onUserConsoleLog was pending » —, puis tuer un processus de travail, qui a
 * emporté avec lui des tests qui passaient isolément.</p>
 *
 * <p>Rendre {@code null} est ce que la librairie de graphiques sait déjà
 * traiter : elle renonce au tracé et le dit une fois, au lieu d'une ligne par
 * appel. Aucun banc ne vérifie un rendu de canevas — ils lisent le DOM, pas les
 * pixels —, donc rien n'est masqué qui soit vérifié par ailleurs.</p>
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

/**
 * Coupe les traces de mise au point, garde les avertissements et les erreurs.
 *
 * <p>Les écrans tracent abondamment sous {@code isDevMode()} — origine des
 * apports, agrégats par filiale, appariements rejoués — et le banc de test est
 * en mode développement. Ces traces servent au navigateur, pas au banc : leur
 * volume a fait échouer un démontage de processus de travail, « Closing rpc
 * while onUserConsoleLog was pending », en emportant des tests qui passaient.
 * </p>
 *
 * <p>{@code warn} et {@code error} restent audibles : ils signalent des
 * défauts, et les taire reviendrait à rendre le banc sourd à ce qu'il doit
 * justement faire remonter. Aucun test n'observe la console — vérifié —, donc
 * rien de vérifié ailleurs n'est masqué ici.</p>
 */
console.log = () => undefined;
console.debug = () => undefined;
console.info = () => undefined;

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

  // La société consultée vit dans un module, pas dans un service : elle
  // survivrait donc d'un test à l'autre, et un banc qui choisit une filiale
  // ferait filtrer le référentiel du banc suivant.
  definirSocieteCourante(null);
});
