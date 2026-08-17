# Chantier B — Persistance des saisies en base

## Pourquoi

Les saisies des 19 écrans de mesure résident aujourd'hui dans le `localStorage`
du navigateur. Un cache vidé, un changement de poste ou de navigateur les efface
définitivement. Le seul filet est l'export manuel (`Paramètres › Sauvegarde &
Données`).

Ce document décrit ce qui manque **côté serveur** pour que le frontend puisse
cesser d'écrire dans le navigateur.

## L'obstacle principal : le modèle de données

`emission_measure` porte aujourd'hui :

```
id · quantity · measure_date · total_co2e · emission_factor_id · origin
import_log_id · source_code · category_code · usine_id · filiale_id
unit · currency · label
```

Les écrans portent bien davantage — `modeTransport`, `filiere`, `poidsKg`,
`distanceKm`, `tonneKm`, `transporteur`, `prestataire`, `provenance`,
`noteEstimation`, `covoiturage`, `joursTravailles`… **Ces champs n'ont nulle
part où aller.** Migrer sans les accueillir revient à les perdre à
l'enregistrement.

Deux options, à trancher avant tout développement :

| Option | Principe | Avantage | Coût |
|---|---|---|---|
| **A — colonne JSON** | ajouter `donnees_specifiques NVARCHAR(MAX)` sur `emission_measure` | une seule table, migration rapide | données non requêtables en SQL |
| **B — tables par catégorie** | une table par écran, liée à `emission_measure` | requêtable, typé | 19 tables, 19 mappings |

Recommandation : **option A** pour la première mise en production, l'option B
pour les catégories qui devront être requêtées finement (Investissements,
Déchets).

## Les 4 points d'entrée manquants

### 1. Création en lot

```
POST /api/v1/emission-measures/batch
Body : EmissionMeasure[]
→ 201 { crees: number, rejetes: [{ index, motif }] }
```

Aujourd'hui seul `POST /emission-measures` unitaire existe. Une ventilation de
2 175 immobilisations ferait autant de requêtes. La création doit être
transactionnelle : soit le lot passe, soit rien.

### 2. Lecture par catégorie et périmètre

```
GET /api/v1/emission-measures?categoryCode=&year=&usineId=&filialeId=
→ 200 EmissionMeasure[]
```

Aucun point d'entrée ne rend aujourd'hui les mesures filtrées par catégorie et
exercice. C'est ce que chaque écran appellera à son initialisation, en
remplacement de sa lecture `localStorage`.

### 3. Suppression en cascade d'un dépôt

```
DELETE /api/v1/referential/import/{importLogId}
→ 204, supprime le journal ET les mesures portant cet import_log_id
```

L'écran d'import propose déjà la suppression d'un dépôt, mais elle ne vaut que
côté navigateur : le journal serveur et ses mesures subsistent.

### 4. Mise à jour et suppression unitaires par catégorie

```
PUT    /api/v1/emission-measures/{id}
DELETE /api/v1/emission-measures/{id}
```

`PUT` et `DELETE` existent déjà et fonctionnent. À vérifier seulement : que la
mise à jour préserve `donnees_specifiques` et rejoue le rattachement
`usine → filiale` (déjà en place via `rattacherALaFiliale`).

## Points connexes

- **Statistiques** : `EmissionMeasureRepository.agregerParAxes()` groupe sur
  `m.filialeId`. Une fois `usine_id` renseigné partout, envisager la jointure
  `emission_measure → usine → filiale` et le retrait de `filiale_id`.
- **Migration des données existantes** : aucune reprise automatique n'est
  possible depuis le `localStorage` des postes utilisateurs. La voie réaliste
  est l'export global (`Sauvegarde & Données`) puis un réimport via le point
  d'entrée n° 1.
- **Frontend** : une fois ces points livrés, remplacer dans chaque écran la
  lecture/écriture `localStorage` par le service HTTP, en conservant le
  `localStorage` comme cache hors ligne si nécessaire.

## Estimation

| Lot | Contenu | Ordre de grandeur |
|---|---|---|
| 1 | Modèle (option A) + migration SQL | 0,5 j |
| 2 | Points d'entrée 1 à 3 + tests | 1,5 j |
| 3 | Migration des 19 écrans côté frontend | 3 à 4 j |
| 4 | Reprise des données existantes par export/réimport | 0,5 j |

**Total : 6 à 7 jours**, hors recette. À ne pas tenter dans une fenêtre de 48 h.
