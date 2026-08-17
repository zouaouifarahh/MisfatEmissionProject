import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { OrganizationService } from '../services/organization.service';
import { EmissionStatsService, EmissionStats } from '../services/emission-stats.service';
import { Filiale, Usine } from '../models/organization.model';
import { DispatchStore } from '../shared/dispatch/dispatch-store';
import { totauxLocaux } from '../shared/dispatch/mesures-locales';
import { PerimetreOrganisation } from './perimetre';
import { tonnesVersKg } from './unites-carbone';
import {
  CodeScope,
  NOMENCLATURE_SCOPES,
  PosteNomenclature,
  posteDepuisIntitule,
  scopeDuPoste
} from './nomenclature-scopes';

/**
 * Bilan carbone consolidé d'un périmètre [société + exercice].
 *
 * <p>Trois sources alimentent un même bilan : les mesures enregistrées en base,
 * la ventilation d'un classeur comptable et les saisies conservées dans les
 * écrans de catégorie. Le tableau de bord les additionne pour son propre
 * affichage ; ce service fait le même calcul pour le rapport, en le rendant sur
 * la nomenclature complète des trois scopes.</p>
 *
 * <p>Les valeurs circulent en kilogrammes de CO₂ équivalent, unité dans
 * laquelle les trois sources s'expriment. La conversion en tonnes appartient à
 * l'affichage.</p>
 */

/** Provenance d'un apport, restituée dans le rapport. */
export type OrigineApport = 'Base de données' | 'Ventilation comptable' | 'Saisie écran';

/** Poste du bilan, qu'il ait été collecté ou non. */
export interface PosteBilan {
  id: string;
  libelle: string;
  icone: string;
  collecte: boolean;
  numeroGhg?: number;
  scopeCode: CodeScope;
  scopeNom: string;
  scopeCouleur: string;
  emissionKg: number;
  /** Nombre de lignes de mesure ayant alimenté le poste. */
  lignes: number;
  /** Part du poste dans son scope, en pourcentage. */
  pctScope: number;
  /** Part du poste dans le bilan total, en pourcentage. */
  pctTotal: number;
  origines: OrigineApport[];
}

export interface ScopeBilan {
  id: string;
  code: CodeScope;
  nom: string;
  soustitre: string;
  couleur: string;
  emissionKg: number;
  pct: number;
  postes: PosteBilan[];
}

/** Poste relevé en base mais absent de la nomenclature interne. */
export interface PosteHorsNomenclature {
  libelle: string;
  scopeCode: string;
  emissionKg: number;
}

export interface BilanCarbone {
  /** Société retenue ; `null` en vue consolidée groupe. */
  entityId: number | null;
  /** Exercice retenu ; `null` en vue pluriannuelle. */
  annee: number | null;
  libelleSociete: string;
  libelleExercice: string;
  pays: string;
  devise: string;

  totalKg: number;
  scope1Kg: number;
  scope2Kg: number;
  scope3Kg: number;
  /** Nombre de lignes de mesure retenues, toutes sources confondues. */
  mesures: number;

  scopes: ScopeBilan[];
  /** Tous les postes, dans l'ordre de la nomenclature. */
  postes: PosteBilan[];
  horsNomenclature: PosteHorsNomenclature[];

  /** Faux lorsque emission-service n'a pas répondu ; le bilan repose alors sur les seuls relevés locaux. */
  serveurJoignable: boolean;
}

/** Identité du périmètre consolidé, que la fusion ne peut pas déduire seule. */
export interface IdentitePerimetre {
  libelleSociete: string;
  pays: string;
  devise: string;
  annee: number | null;
  libelleExercice: string;
}

/**
 * Fusionne plusieurs bilans en un seul.
 *
 * <p>Un pays d'implantation peut réunir plusieurs sociétés — la Tunisie en
 * compte trois — et le serveur n'agrège que par société. Consolider par pays
 * suppose donc d'additionner les bilans, poste par poste.</p>
 *
 * <p>Les quotes-parts ne sont jamais additionnées : un pourcentage de deux
 * bilans distincts ne veut rien dire une fois sommé. Elles sont
 * <strong>recalculées</strong> sur les totaux consolidés.</p>
 *
 * <p>{@code serveurJoignable} n'est vrai que si <em>tous</em> les bilans le
 * sont : un rapport consolidé dont une société repose sur les seuls relevés
 * locaux doit le déclarer.</p>
 */
export function fusionnerBilans(bilans: BilanCarbone[], identite: IdentitePerimetre): BilanCarbone {
  const totalKg = bilans.reduce((s, b) => s + b.totalKg, 0);

  /** Cumule les postes de même identifiant, sans additionner leurs parts. */
  const cumulerPostes = (postes: PosteBilan[]): PosteBilan[] => {
    const parId = new Map<string, PosteBilan>();

    for (const poste of postes) {
      const acquis = parId.get(poste.id);
      if (!acquis) {
        parId.set(poste.id, { ...poste, origines: [...poste.origines] });
        continue;
      }

      acquis.emissionKg += poste.emissionKg;
      acquis.lignes += poste.lignes;
      acquis.collecte = acquis.collecte || poste.collecte;
      for (const origine of poste.origines) {
        if (!acquis.origines.includes(origine)) acquis.origines.push(origine);
      }
    }

    return [...parId.values()];
  };

  const postes = cumulerPostes(bilans.flatMap(b => b.postes)).map(poste => ({
    ...poste,
    pctTotal: totalKg > 0 ? (poste.emissionKg / totalKg) * 100 : 0
  }));

  // Les scopes sont reconstruits depuis les bilans d'origine pour conserver
  // leurs libellés et couleurs, que les postes ne portent qu'en partie.
  const scopes: ScopeBilan[] = [];
  for (const modele of bilans[0]?.scopes ?? []) {
    const memes = bilans.flatMap(b => b.scopes.filter(s => s.code === modele.code));
    const emissionKg = memes.reduce((s, scope) => s + scope.emissionKg, 0);

    const postesDuScope = cumulerPostes(memes.flatMap(s => s.postes)).map(poste => ({
      ...poste,
      pctScope: emissionKg > 0 ? (poste.emissionKg / emissionKg) * 100 : 0,
      pctTotal: totalKg > 0 ? (poste.emissionKg / totalKg) * 100 : 0
    }));

    scopes.push({
      ...modele,
      emissionKg,
      pct: totalKg > 0 ? (emissionKg / totalKg) * 100 : 0,
      postes: postesDuScope
    });
  }

  // Les parts par scope sont reportées sur la liste plate des postes, pour que
  // les deux vues du même poste ne se contredisent pas.
  const partsParPoste = new Map(
    scopes.flatMap(s => s.postes).map(p => [p.id, p.pctScope])
  );

  const horsNomenclature = new Map<string, PosteHorsNomenclature>();
  for (const poste of bilans.flatMap(b => b.horsNomenclature)) {
    const clef = `${poste.scopeCode}|${poste.libelle}`;
    const acquis = horsNomenclature.get(clef);
    if (acquis) acquis.emissionKg += poste.emissionKg;
    else horsNomenclature.set(clef, { ...poste });
  }

  return {
    entityId: null,
    annee: identite.annee,
    libelleSociete: identite.libelleSociete,
    libelleExercice: identite.libelleExercice,
    pays: identite.pays,
    devise: identite.devise,

    totalKg,
    scope1Kg: bilans.reduce((s, b) => s + b.scope1Kg, 0),
    scope2Kg: bilans.reduce((s, b) => s + b.scope2Kg, 0),
    scope3Kg: bilans.reduce((s, b) => s + b.scope3Kg, 0),
    mesures: bilans.reduce((s, b) => s + b.mesures, 0),

    scopes,
    postes: postes.map(p => ({ ...p, pctScope: partsParPoste.get(p.id) ?? p.pctScope })),
    horsNomenclature: [...horsNomenclature.values()],

    serveurJoignable: bilans.every(b => b.serveurJoignable)
  };
}

/** Cumul intermédiaire d'un poste, avant calcul des quotes-parts. */
interface CumulPoste {
  emissionKg: number;
  lignes: number;
  origines: Set<OrigineApport>;
}

@Injectable({ providedIn: 'root' })
export class BilanCarboneService {
  private readonly organizationService = inject(OrganizationService);
  private readonly statsService = inject(EmissionStatsService);
  private readonly dispatchStore = inject(DispatchStore);

  /**
   * Bilan du périmètre demandé.
   *
   * <p>Le serveur filtre déjà ses agrégats sur la société, l'usine et
   * l'exercice ; les deux replis locaux sont filtrés ici, par les mêmes règles
   * d'étanchéité. Un serveur muet ne vide pas le rapport : les relevés locaux
   * portent alors seuls le bilan, et le rapport le dit.</p>
   */
  charger(entityId: number | null, usineId: number | null, annee: number | null): Observable<BilanCarbone> {
    const filiales$ = this.organizationService.getFiliales()
      .pipe(catchError(() => of([] as Filiale[])));

    const stats$ = this.statsService.aggregate('PHYSIQUE', entityId, usineId, annee)
      .pipe(catchError(() => of(null)));

    return forkJoin({ filiales: filiales$, stats: stats$ }).pipe(
      switchMap(({ filiales, stats }) => {
        const societe = filiales.find(f => f.id === entityId) ?? null;
        const declarees = societe?.usines ?? [];

        // La liste des filiales ne porte pas toujours ses usines : sans elles,
        // aucune saisie ne pourrait être rattachée à la société consultée.
        if (entityId === null || declarees.length) {
          return of({ filiales, stats, usines: declarees });
        }

        return this.organizationService.getUsinesByFiliale(entityId).pipe(
          catchError(() => of([] as Usine[])),
          map(usines => ({ filiales, stats, usines }))
        );
      }),
      map(({ filiales, stats, usines }) =>
        this.construire(entityId, annee, filiales, usines, stats))
    );
  }

  /**
   * Bilan consolidé de plusieurs sociétés — le cas d'un pays d'implantation.
   *
   * <p>Le serveur n'agrège que par société : un pays qui en réunit plusieurs
   * exige d'additionner leurs bilans. Les cas d'une seule société, ou d'aucune,
   * retombent sur {@link charger} plutôt que de passer par une fusion inutile.</p>
   */
  chargerConsolide(entityIds: number[], annee: number | null,
                   identite: IdentitePerimetre): Observable<BilanCarbone> {
    if (!entityIds.length) return this.charger(null, null, annee);
    if (entityIds.length === 1) return this.charger(entityIds[0], null, annee);

    return forkJoin(entityIds.map(id => this.charger(id, null, annee)))
      .pipe(map(bilans => fusionnerBilans(bilans, identite)));
  }

  /** Périmètre organisationnel résolu, tel que les replis locaux l'appliquent. */
  private organisationDe(entityId: number | null, filiales: Filiale[], usines: Usine[]): PerimetreOrganisation {
    return {
      entityId,
      etablissements: usines.map(u => u.nom).filter(Boolean),
      societeUnique: filiales.length <= 1
    };
  }

  private construire(
    entityId: number | null,
    annee: number | null,
    filiales: Filiale[],
    usines: Usine[],
    stats: EmissionStats | null
  ): BilanCarbone {
    const organisation = this.organisationDe(entityId, filiales, usines);
    const cumuls = new Map<string, CumulPoste>();
    const horsNomenclature: PosteHorsNomenclature[] = [];
    let mesures = 0;

    const ajouter = (posteId: string, valeur: number, lignes: number, origine: OrigineApport) => {
      const cumul = cumuls.get(posteId) ?? { emissionKg: 0, lignes: 0, origines: new Set<OrigineApport>() };
      cumul.emissionKg += valeur;
      cumul.lignes += lignes;
      if (valeur !== 0 || lignes > 0) cumul.origines.add(origine);
      cumuls.set(posteId, cumul);
    };

    // 1. Les mesures enregistrées en base, déjà cloisonnées par le serveur.
    //
    //    Le serveur agrège en tCO₂e — c'est l'unité qu'il déclare — alors que ce
    //    bilan cumule des kilogrammes, comme les apports locaux des étapes 2 et
    //    3. Sans cette conversion, la part serveur pesait mille fois moins que
    //    la part locale, et un exercice documenté par la seule base ressortait
    //    à 0,00 tCO₂e sur la mini-carte du graphique d'évolution.
    for (const [scopeCode, categories] of Object.entries(stats?.byScopeCategory ?? {})) {
      for (const [intitule, valeur] of Object.entries(categories ?? {})) {
        const posteId = posteDepuisIntitule(intitule);
        const valeurKg = tonnesVersKg(valeur);

        // Un poste dont le scope ne concorde pas relève d'une homonymie : le
        // rattacher au mauvais scope fausserait la répartition du bilan.
        if (posteId && scopeDuPoste(posteId) === scopeCode) {
          ajouter(posteId, valeurKg, 0, 'Base de données');
        } else {
          horsNomenclature.push({ libelle: intitule, scopeCode, emissionKg: valeurKg });
        }
      }
    }
    mesures += stats?.measureCount ?? 0;

    // 2. La ventilation d'un classeur comptable, restée dans le navigateur.
    for (const ligne of this.dispatchStore.lignesPour(annee, entityId)) {
      if (!ligne.ecran) continue;
      const posteId = posteDepuisIntitule(ligne.ecran);
      if (!posteId) continue;
      ajouter(posteId, ligne.emissionKg, 1, 'Ventilation comptable');
      mesures += 1;
    }

    // 3. Les saisies des écrans, en repli des seuls postes que le serveur ne
    //    documente pas : un poste qu'il chiffre n'est ni écrasé, ni doublé.
    for (const local of totauxLocaux(annee, organisation)) {
      const posteId = posteDepuisIntitule(local.categorie);
      if (!posteId) continue;
      if ((cumuls.get(posteId)?.emissionKg ?? 0) > 0) continue;

      ajouter(posteId, local.emissionKg, local.lignes, 'Saisie écran');
      mesures += local.lignes;
    }

    return this.assembler(entityId, annee, filiales, cumuls, horsNomenclature, mesures, stats !== null);
  }

  /** Met les cumuls en forme sur la nomenclature et calcule les quotes-parts. */
  private assembler(
    entityId: number | null,
    annee: number | null,
    filiales: Filiale[],
    cumuls: Map<string, CumulPoste>,
    horsNomenclature: PosteHorsNomenclature[],
    mesures: number,
    serveurJoignable: boolean
  ): BilanCarbone {
    const totalKg = [...cumuls.values()].reduce((somme, c) => somme + c.emissionKg, 0)
      + horsNomenclature.reduce((somme, p) => somme + p.emissionKg, 0);

    const scopes: ScopeBilan[] = NOMENCLATURE_SCOPES.map(scope => {
      const postes = scope.postes.map(poste => this.posteBilan(scope.code, scope.nom, scope.couleur, poste, cumuls));
      const emissionKg = postes.reduce((somme, p) => somme + p.emissionKg, 0);

      return {
        id: scope.id,
        code: scope.code,
        nom: scope.nom,
        soustitre: scope.soustitre,
        couleur: scope.couleur,
        emissionKg,
        pct: totalKg ? (emissionKg / totalKg) * 100 : 0,
        postes: postes.map(poste => ({
          ...poste,
          pctScope: emissionKg ? (poste.emissionKg / emissionKg) * 100 : 0,
          pctTotal: totalKg ? (poste.emissionKg / totalKg) * 100 : 0
        }))
      };
    });

    const societe = filiales.find(f => f.id === entityId) ?? null;

    return {
      entityId,
      annee,
      libelleSociete: societe ? societe.libelle : 'Groupe MISFAT — vue consolidée',
      libelleExercice: annee !== null ? String(annee) : 'Tous exercices confondus',
      pays: societe?.pays?.trim() || (entityId === null ? 'Périmètre groupe' : '—'),
      devise: societe?.devise?.trim().toUpperCase() || (entityId === null ? 'Multi-devise' : 'TND'),

      totalKg,
      scope1Kg: scopes.find(s => s.code === 'SCOPE_1')?.emissionKg ?? 0,
      scope2Kg: scopes.find(s => s.code === 'SCOPE_2')?.emissionKg ?? 0,
      scope3Kg: scopes.find(s => s.code === 'SCOPE_3')?.emissionKg ?? 0,
      mesures,

      scopes,
      postes: scopes.flatMap(s => s.postes),
      horsNomenclature,
      serveurJoignable
    };
  }

  private posteBilan(
    scopeCode: CodeScope,
    scopeNom: string,
    scopeCouleur: string,
    poste: PosteNomenclature,
    cumuls: Map<string, CumulPoste>
  ): PosteBilan {
    const cumul = cumuls.get(poste.id);

    return {
      id: poste.id,
      libelle: poste.libelle,
      icone: poste.icone,
      collecte: poste.collecte,
      numeroGhg: poste.numeroGhg,
      scopeCode,
      scopeNom,
      scopeCouleur,
      emissionKg: cumul?.emissionKg ?? 0,
      lignes: cumul?.lignes ?? 0,
      pctScope: 0,
      pctTotal: 0,
      origines: cumul ? [...cumul.origines] : []
    };
  }
}
