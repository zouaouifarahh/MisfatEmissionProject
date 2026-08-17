import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DispatchStore, LigneValorisee } from './dispatch-store';
import { EcranDestination, libelleEcran, iconeEcran } from './regles-dispatch';

/**
 * Bandeau des lignes comptables ventilées vers un écran.
 *
 * <p>Posé en tête de chaque catégorie destinataire, il rend visible sans
 * délai le produit de la répartition globale : l'utilisateur dépose un
 * classeur une fois et retrouve ses lignes sous chaque entrée du menu.</p>
 */
@Component({
  selector: 'app-lignes-dispatchees',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lignes-dispatchees.html',
  styleUrl: './lignes-dispatchees.css'
})
export class LignesDispatcheesComponent implements OnInit {

  /** Écran destinataire dont on affiche les lignes. */
  @Input({ required: true }) ecran!: EcranDestination;

  lignes: LigneValorisee[] = [];
  deplie = false;

  readonly libelleEcran = libelleEcran;
  readonly iconeEcran = iconeEcran;

  constructor(private store: DispatchStore, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.store.pour(this.ecran).subscribe({
      next: lignes => {
        this.lignes = lignes ?? [];
        this.cdr.detectChanges();
      },
      // Le bandeau est un supplément : son échec ne doit pas emporter l'écran.
      error: () => { this.lignes = []; this.cdr.detectChanges(); }
    });
  }

  basculer(): void {
    this.deplie = !this.deplie;
    this.cdr.detectChanges();
  }

  get totalMontant(): number {
    return this.lignes.reduce((somme, l) => somme + l.quantite, 0);
  }

  get totalEmissions(): number {
    return this.lignes.reduce((somme, l) => somme + l.emissionKg, 0);
  }

  get totalTonnes(): number {
    return this.totalEmissions / 1000;
  }

  get nombreReplis(): number {
    return this.lignes.filter(l => l.origineFacteur === 'ADEME Fallback').length;
  }

  get fichier(): string {
    return this.store.instantane.fichier;
  }

  get importeLe(): string {
    return this.store.instantane.importeLe;
  }

  /** Exercice de la répartition : il peut différer de celui consulté. */
  get exercice(): number | null {
    return this.store.instantane.exercice;
  }
}
