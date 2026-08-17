/* =============================================================================
   Normalisation des unités de emission_factor
   Date       : 2026-08-12
   Base       : MisfatDB
   Auteur     : maintenance référentiel carbone

   MOTIF
   -----
   La colonne emission_factor.unit portait la même unité sous plusieurs casses,
   l'importateur du classeur l'écrivant verbatim (CarbonReferentialImporter,
   setUnit ligne 270) :

       kWh (5) · KWh (4) · Kwh (1)   → 10 lignes pour une seule unité
       Kg (21) · KG (5)  · kg (5)    → 31 lignes pour une seule unité
       Km (9)  · km (2)              → 11 lignes pour une seule unité

   Une ligne portait en outre une unité malformée : « KGCO2eq/KG » désigne
   l'unité du facteur lui-même, non son dénominateur. Le dénominateur attendu
   est le kilogramme — sa valeur (2255,5 kgCO2e/kg) est cohérente avec un
   potentiel de réchauffement de fluide frigorigène rapporté au kilo.

   PORTÉE
   ------
   Seules les variantes de casse sont fusionnées. Les unités sémantiquement
   distinctes ou ambiguës sont laissées en place et signalées en fin de script :
   T / Tonne, Tonne.Km / metric ton*km, unite / Unit. Les fusionner relève d'une
   décision de modélisation, pas d'un nettoyage de casse.

   SÛRETÉ
   ------
   - Script idempotent : une seconde exécution ne change rien.
   - Transaction explicite, avec contrôle du nombre de lignes touchées.
   - unit est une colonne descriptive : aucune clé, aucun index unique, aucune
     jointure n'en dépend.
   - La collation par défaut de SQL Server étant insensible à la casse, les
     clauses WHERE ci-dessous atteignent toutes les variantes d'une même unité.
   ============================================================================= */

USE MisfatDB;
SET NOCOUNT OFF;

/* ---------- ÉTAT AVANT ---------- */
PRINT '=== AVANT normalisation ===';
SELECT unit COLLATE Latin1_General_BIN2 AS unite, COUNT(*) AS nb
FROM emission_factor
WHERE unit IS NOT NULL
GROUP BY unit COLLATE Latin1_General_BIN2
ORDER BY nb DESC;

BEGIN TRANSACTION;

BEGIN TRY

    /* ---------- 1. Kilowattheure : kWh ---------- */
    UPDATE emission_factor
    SET unit = 'kWh'
    WHERE unit IN ('kWh', 'KWh', 'Kwh', 'KWH')
      AND unit COLLATE Latin1_General_BIN2 <> 'kWh';
    PRINT CONCAT('kWh normalisés  : ', @@ROWCOUNT);

    /* ---------- 2. Kilogramme : kg ---------- */
    UPDATE emission_factor
    SET unit = 'kg'
    WHERE unit IN ('kg', 'Kg', 'KG')
      AND unit COLLATE Latin1_General_BIN2 <> 'kg';
    PRINT CONCAT('kg normalisés   : ', @@ROWCOUNT);

    /* ---------- 3. Kilomètre : km ---------- */
    UPDATE emission_factor
    SET unit = 'km'
    WHERE unit IN ('km', 'Km', 'KM')
      AND unit COLLATE Latin1_General_BIN2 <> 'km';
    PRINT CONCAT('km normalisés   : ', @@ROWCOUNT);

    /* ---------- 4. Unité malformée : KGCO2eq/KG → kg ----------
       Le dénominateur du facteur est le kilogramme ; « KGCO2eq/KG » décrivait
       le rapport complet et rendait la conversion d'unité impossible. */
    UPDATE emission_factor
    SET unit = 'kg'
    WHERE unit = 'KGCO2eq/KG';
    PRINT CONCAT('KGCO2eq/KG corrigés : ', @@ROWCOUNT);

    COMMIT TRANSACTION;
    PRINT '=== Transaction validée ===';

END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT '=== ÉCHEC : transaction annulée ===';
    THROW;
END CATCH;

/* ---------- ÉTAT APRÈS ---------- */
PRINT '=== APRÈS normalisation ===';
SELECT unit COLLATE Latin1_General_BIN2 AS unite, COUNT(*) AS nb
FROM emission_factor
WHERE unit IS NOT NULL
GROUP BY unit COLLATE Latin1_General_BIN2
ORDER BY nb DESC;

/* ---------- POINTS LAISSÉS À DÉCIDER ---------- */
PRINT '=== Unités restant à arbitrer (hors casse) ===';
SELECT unit COLLATE Latin1_General_BIN2 AS unite, COUNT(*) AS nb,
       'Doublon sémantique probable — décision de modélisation' AS observation
FROM emission_factor
WHERE unit IN ('T', 'Tonne', 'Tonne.Km', 'metric ton*km', 'unite', 'Unit')
GROUP BY unit COLLATE Latin1_General_BIN2
ORDER BY unite;
