import { ErrorHandler, Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Gestionnaire d'erreurs qui rend la panne visible à l'écran.
 *
 * <p>Une exception survenue pendant le rendu laisse un écran vide : sans
 * ouvrir les outils de développement, l'utilisateur ne peut ni comprendre ni
 * rapporter ce qui s'est produit. Ce gestionnaire affiche le message, son
 * origine et le début de la pile dans un bandeau flottant, de sorte qu'une
 * simple capture d'écran suffise au diagnostic.</p>
 *
 * <p>Il n'avale rien : la console reçoit l'erreur complète comme
 * auparavant.</p>
 */
@Injectable()
export class ErreurVisibleHandler implements ErrorHandler {

  private static readonly ID_BANDEAU = 'bandeau-erreur-execution';

  /** Limite le bandeau aux dernières erreurs, pour rester lisible. */
  private static readonly MAX_ERREURS = 3;

  private compte = 0;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  handleError(erreur: unknown): void {
    // La console reste la source de vérité : on n'y touche pas.
    console.error(erreur);

    if (!isPlatformBrowser(this.platformId)) return;

    try {
      this.afficher(erreur);
    } catch {
      // Un échec d'affichage ne doit jamais masquer l'erreur d'origine.
    }
  }

  private afficher(erreur: unknown): void {
    if (this.compte >= ErreurVisibleHandler.MAX_ERREURS) return;
    this.compte++;

    const message = erreur instanceof Error ? erreur.message : String(erreur);
    const pile = erreur instanceof Error && erreur.stack
      ? erreur.stack.split('\n').slice(1, 4).join('\n')
      : '';

    const bandeau = this.obtenirBandeau();

    const entree = document.createElement('div');
    entree.style.cssText = 'padding:10px 12px;border-top:1px solid rgba(255,255,255,.25);';
    entree.innerHTML =
      `<div style="font-weight:800;margin-bottom:4px">⛔ Erreur d'exécution</div>`
      + `<div style="font-weight:600">${this.echapper(message)}</div>`
      + (pile ? `<pre style="margin:6px 0 0;font-size:10.5px;opacity:.85;`
               + `white-space:pre-wrap">${this.echapper(pile)}</pre>` : '');

    bandeau.appendChild(entree);
  }

  private obtenirBandeau(): HTMLElement {
    const existant = document.getElementById(ErreurVisibleHandler.ID_BANDEAU);
    if (existant) return existant;

    const bandeau = document.createElement('div');
    bandeau.id = ErreurVisibleHandler.ID_BANDEAU;
    bandeau.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:9999',
      'max-height:42vh', 'overflow:auto',
      'background:#7F1D1D', 'color:#FFFFFF',
      'border-radius:12px', 'box-shadow:0 14px 34px rgba(127,29,29,.4)',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace', 'font-size:12px'
    ].join(';');

    const fermer = document.createElement('button');
    fermer.textContent = '×';
    fermer.setAttribute('aria-label', 'Fermer');
    fermer.style.cssText = [
      'position:sticky', 'top:0', 'float:right', 'margin:6px 10px 0 0',
      'border:none', 'background:none', 'color:#FFFFFF',
      'font-size:20px', 'line-height:1', 'cursor:pointer'
    ].join(';');
    fermer.onclick = () => bandeau.remove();

    bandeau.appendChild(fermer);
    document.body.appendChild(bandeau);
    return bandeau;
  }

  /** Le message peut contenir du balisage : il est neutralisé avant insertion. */
  private echapper(texte: string): string {
    const noeud = document.createElement('div');
    noeud.textContent = texte;
    return noeud.innerHTML;
  }
}
