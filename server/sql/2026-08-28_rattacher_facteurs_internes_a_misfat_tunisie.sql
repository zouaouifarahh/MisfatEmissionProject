/* ============================================================================
   Rattachement rétroactif des facteurs internes à MISFAT TUNISIE
   ----------------------------------------------------------------------------
   La colonne emission_factor.filiale_id cloisonne les facteurs entre sociétés :
   un facteur public — ADEME, EPA, ECOINVENT, IPCC, DEFRA, DESNZ — documente une
   réalité physique qui ne dépend d'aucune filiale et reste lisible par toutes,
   d'où filiale_id NULL. Un facteur saisi à la main documente en revanche un
   procédé, un contrat ou une mesure propres à une société : le voir depuis une
   autre laisserait MISFAT Maroc calculer son bilan sur un ratio tunisien.

   ddl-auto=update a créé la colonne à NULL sur toutes les lignes existantes.
   Les facteurs MISFAT_INTERNE antérieurs sont donc publics par accident, et non
   par décision. Cette migration les rattache à MISFAT TUNISIE (id 1), seule
   société sur laquelle ils ont pu être saisis à cette date.

   La règle est déclarée, non devinée : elle vient d'un arbitrage explicite.
   Aucun facteur d'une autre provenance n'est touché.

   Idempotente : la clause WHERE exclut les lignes déjà rattachées, et rejouer
   le script ne déplace rien.
   ============================================================================ */

USE MisfatDB;
GO

SET NOCOUNT ON;
GO

/* -- Garde-fou : la société cible doit exister. La migration s'arrête plutôt
   -- que de poser une clé qui ne désigne rien. */
IF NOT EXISTS (SELECT 1 FROM filiale WHERE id = 1)
BEGIN
    RAISERROR ('MISFAT TUNISIE (filiale id = 1) est introuvable : migration interrompue.', 16, 1);
    RETURN;
END
GO

/* -- État avant, pour que le compte rendu soit vérifiable. */
SELECT
    'AVANT' AS etape,
    SUM(CASE WHEN filiale_id IS NULL THEN 1 ELSE 0 END) AS publics,
    SUM(CASE WHEN filiale_id = 1 THEN 1 ELSE 0 END)     AS rattaches_tunisie,
    SUM(CASE WHEN database_source = 'MISFAT_INTERNE'
              AND filiale_id IS NULL THEN 1 ELSE 0 END) AS internes_a_rattacher
FROM emission_factor;
GO

BEGIN TRANSACTION;

UPDATE emission_factor
SET filiale_id = 1,
    updated_at = SYSDATETIME()
WHERE database_source = 'MISFAT_INTERNE'
  AND filiale_id IS NULL;

PRINT CONCAT(@@ROWCOUNT, ' facteur(s) interne(s) rattaché(s) à MISFAT TUNISIE.');

COMMIT TRANSACTION;
GO

/* -- État après. Les provenances publiques doivent être restées à NULL. */
SELECT
    'APRES' AS etape,
    SUM(CASE WHEN filiale_id IS NULL THEN 1 ELSE 0 END) AS publics,
    SUM(CASE WHEN filiale_id = 1 THEN 1 ELSE 0 END)     AS rattaches_tunisie
FROM emission_factor;
GO

/* -- Contrôle : aucun facteur public ne doit avoir été rattaché. */
SELECT database_source, COUNT(*) AS rattaches_par_erreur
FROM emission_factor
WHERE filiale_id IS NOT NULL
  AND database_source <> 'MISFAT_INTERNE'
GROUP BY database_source;
GO
