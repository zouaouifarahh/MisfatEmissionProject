import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

import { PerimetreOrganisation } from '../core/perimetre';

/**
 * Mesures enregistrées en base, telles que les écrans de saisie doivent les voir.
 *
 * <p>Le tableau de bord agrège deux gisements : les saisies du navigateur et
 * les mesures du serveur. Les écrans de saisie, eux, ne lisaient que le premier.
 * Une catégorie pouvait donc peser vingt-huit mille tonnes au bilan et afficher
 * « aucun actif loué enregistré » sur son propre écran — le chiffre existait,
 * l'écran chargé de le documenter le niait, et rien ne permettait de savoir
 * lequel des deux avait tort.</p>
 *
 * <p>Ces mesures sont rendues en lecture seule : elles viennent d'un import ou
 * d'une saisie serveur, et les corriger depuis l'écran demanderait un chemin
 * d'écriture que la base ne propose pas encore. Les montrer sans pouvoir les
 * modifier vaut mieux que de les taire.</p>
 */

/** Mesure telle que l'API la rend, réduite à ce que les écrans affichent. */
export interface MesureServeur {
  id: number;
  /** Ce que la mesure documente, tel qu'il a été saisi ou importé. */
  libelle: string;
  /** Catégorie GHG portée par le facteur, en nomenclature serveur. */
  categorie: string;
  scope: string;
  quantite: number;
  unite: string;
  /** Émission totale, en kgCO₂e comme partout ailleurs dans l'application. */
  emissionKg: number;
  /** Date que la mesure documente, au format ISO. */
  date: string;
  /** Société propriétaire ; `null` quand la base ne la renseigne pas. */
  filialeId: number | null;
  /** Provenance : saisie directe, import de classeur… */
  origine: string;
  /** Base documentaire du facteur appliqué. */
  baseAppliquee: string;
}

/** Mesure brute, telle que l'API la sérialise. */
interface MesureBrute {
  id: number;
  label?: string | null;
  quantity?: number | null;
  unit?: string | null;
  totalCo2e?: number | null;
  measureDate?: string | null;
  filialeId?: number | null;
  origin?: string | null;
  emissionFactor?: {
    databaseSource?: string | null;
    carbonReference?: {
      category?: { name?: string | null; scope?: { code?: string | null } | null } | null;
    } | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class MesuresServeurService {

  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8082/api/v1/emission-measures';

  /**
   * Toutes les mesures de la base, chargées une fois puis partagées.
   *
   * <p>Dix-neuf écrans les demandent, chacun pour sa catégorie. Un appel par
   * écran ferait dix-neuf requêtes pour le même contenu ; le filtrage est donc
   * fait ici, sur une seule réponse retenue.</p>
   */
  private readonly toutes$: Observable<MesureServeur[]> = this.http
    .get<MesureBrute[]>(this.baseUrl)
    .pipe(
      map(brutes => (Array.isArray(brutes) ? brutes : []).map(m => this.adapter(m))),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  /** Mesures de la base, toutes catégories confondues. */
  mesures(): Observable<MesureServeur[]> {
    return this.toutes$;
  }

  private adapter(brute: MesureBrute): MesureServeur {
    const reference = brute.emissionFactor?.carbonReference;
    const categorie = reference?.category;

    return {
      id: brute.id,
      libelle: String(brute.label ?? '').trim() || '(sans libellé)',
      categorie: String(categorie?.name ?? '').trim(),
      scope: String(categorie?.scope?.code ?? '').trim(),
      quantite: Number(brute.quantity) || 0,
      unite: String(brute.unit ?? '').trim(),
      emissionKg: Number(brute.totalCo2e) || 0,
      date: String(brute.measureDate ?? '').trim(),
      filialeId: brute.filialeId ?? null,
      origine: String(brute.origin ?? '').trim(),
      baseAppliquee: String(brute.emissionFactor?.databaseSource ?? '').trim()
    };
  }
}

/**
 * La mesure relève-t-elle du périmètre consulté ?
 *
 * <p>Les mêmes deux axes qu'ailleurs — société et exercice —, appliqués aux
 * champs que le serveur renseigne : la filiale y est portée directement, et la
 * date de mesure tient lieu de période. Une mesure sans filiale n'est retenue
 * que si le groupe n'en compte qu'une : l'attribuer serait arbitraire.</p>
 */
export function mesureDuPerimetre(mesure: MesureServeur,
                                  exercice: number | null,
                                  organisation: PerimetreOrganisation): boolean {

  if (exercice !== null) {
    const annee = Number(mesure.date.slice(0, 4));
    if (!Number.isFinite(annee) || annee !== exercice) return false;
  }

  if (organisation.entityId === null) return true;
  if (mesure.filialeId === null) return organisation.societeUnique;

  return mesure.filialeId === organisation.entityId;
}
