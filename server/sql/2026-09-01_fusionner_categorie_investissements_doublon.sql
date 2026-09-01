/* ============================================================================
   Fusion de la categorie « Investissements » dans « Category 15: Investments »
   ----------------------------------------------------------------------------
   L'ecran des sources d'emission envoyait au serveur le libelle francais qu'il
   affiche. Le serveur, lui, resout la categorie PAR SON NOM EXACT et la cree si
   elle manque : « Investissements » a donc fabrique une categorie parallele a
   « Category 15: Investments », qui existait deja.

   La reference INVEST1 et son facteur y ont atterri. La sauvegarde n'a jamais
   echoue — c'est le classement qui etait faux, et le facteur restait invisible
   depuis la categorie qu'on regardait. Une sauvegarde qui reussit en rangeant
   ailleurs est plus trompeuse qu'un echec : rien ne signale l'erreur.

   Le script deplace les references de la categorie parasite vers la categorie
   GHG, puis supprime la parasite si plus rien ne s'y rattache. Les facteurs
   suivent leurs references : ils portent `carbon_reference_id`, non la
   categorie, et n'ont donc pas a etre touches.

   Idempotent : la categorie parasite disparue, le script ne fait plus rien.
   ============================================================================ */

USE MisfatDB;
GO

SET NOCOUNT ON;
GO

/* Les libelles sont designes sans accent : sqlcmd lit le fichier dans la page
   de codes du systeme, et un litteral accentue n'y survit pas — le premier
   passage du reclassement precedent n'avait rien fait, en annoncant zero. */
DECLARE @parasite BIGINT;
DECLARE @cible    BIGINT;

SELECT @parasite = id FROM ref_categories WHERE name LIKE 'Investissement%';
SELECT @cible    = id FROM ref_categories WHERE name LIKE 'Category 15:%';

IF @parasite IS NULL OR @cible IS NULL OR @parasite = @cible
BEGIN
    PRINT 'Aucun doublon a fusionner : rien a faire.';
    RETURN;
END

PRINT '--- AVANT ---';
SELECT c.id, c.name, COUNT(cr.id) AS references_rattachees
FROM   ref_categories c
LEFT   JOIN ref_carbon_references cr ON cr.category_id = c.id
WHERE  c.id IN (@parasite, @cible)
GROUP  BY c.id, c.name;

/* -- Deplacement des references ------------------------------------------- */
UPDATE ref_carbon_references
SET    category_id = @cible
WHERE  category_id = @parasite;

PRINT CONCAT('References deplacees : ', @@ROWCOUNT);

/* -- Suppression de la categorie devenue vide ------------------------------ */
IF NOT EXISTS (SELECT 1 FROM ref_carbon_references WHERE category_id = @parasite)
BEGIN
    DELETE FROM ref_categories WHERE id = @parasite;
    PRINT 'Categorie parasite supprimee.';
END
ELSE
BEGIN
    PRINT 'Categorie parasite conservee : des references y subsistent.';
END

PRINT '--- APRES ---';
SELECT c.id, c.name, COUNT(cr.id) AS references_rattachees
FROM   ref_categories c
LEFT   JOIN ref_carbon_references cr ON cr.category_id = c.id
WHERE  c.name LIKE 'Category 15:%' OR c.name LIKE 'Investissement%'
GROUP  BY c.id, c.name;
GO
