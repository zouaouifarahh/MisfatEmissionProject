/* ============================================================================
   Fusion des categories jumelles
   ----------------------------------------------------------------------------
   La base porte deux libelles pour un meme poste : l'un venu de l'import GHG,
   l'autre cree par l'ecran des sources d'emission, qui envoyait son libelle
   francais. Le serveur resolvait la categorie par nom exact et la creait quand
   il ne correspondait a rien.

   Les facteurs des deux jumelles cessaient alors de se voir : un facteur cree
   sous « Combustion des vehicules » restait invisible depuis « Company owned
   cars », et reciproquement. Rien ne signalait l'ecart — l'enregistrement
   reussissait, seul le classement etait faux.

   Le serveur ne fabrique plus de jumelle : il resout par numero GHG pour le
   scope 3, par synonymie pour les scopes 1 et 2. Ce script traite les jumelles
   deja creees, que ce correctif ne peut pas rattraper.

   Les categories sont designees par leur identifiant et non par leur nom :
   ceux-ci portent des accents, et sqlcmd lit le fichier dans la page de codes
   du systeme — un litteral accentue n'y survit pas. Le premier reclassement de
   cette session l'a appris a ses depens, en annoncant zero ligne traitee.

   FUSIONS APPLIQUEES
     SCOPE 1
       2  Company owned cars                         -> 56  Combustion des vehicules
       3  Company owned vehicles                     -> 56  Combustion des vehicules
       1  Refrigerant gas loss and other fugitive... -> 55  Emissions de refrigerants
     SCOPE 3
       54 Biens d'equipement                         -> 6   Category 2: Capital Goods

   La derniere n'etait pas demandee : elle a ete relevee en dressant la carte
   des doublons. Sa direction s'inverse par rapport aux autres — le scope 3 se
   resout par numero GHG, et c'est donc le libelle numerote qui fait foi.

   « Stationary combustion » n'existe pas en base : rien a fusionner de ce cote.

   Les facteurs suivent leurs references : ils portent `carbon_reference_id`,
   non la categorie. Idempotent : les jumelles disparues, le script ne fait plus
   rien.
   ============================================================================ */

USE MisfatDB;
GO

SET NOCOUNT ON;
GO

DECLARE @fusions TABLE (source BIGINT, cible BIGINT, libelle NVARCHAR(80));

INSERT INTO @fusions (source, cible, libelle) VALUES
    (2,  56, 'Company owned cars -> Combustion vehicules'),
    (3,  56, 'Company owned vehicles -> Combustion vehicules'),
    (1,  55, 'Refrigerant gas loss -> Emissions refrigerants'),
    (54, 6,  'Biens d equipement -> Category 2: Capital Goods');

PRINT '--- AVANT ---';
SELECT c.id, c.scope_id, COUNT(cr.id) AS refs
FROM   ref_categories c
LEFT   JOIN ref_carbon_references cr ON cr.category_id = c.id
WHERE  c.id IN (SELECT source FROM @fusions) OR c.id IN (SELECT cible FROM @fusions)
GROUP  BY c.id, c.scope_id
ORDER  BY c.id;

DECLARE @source BIGINT, @cible BIGINT, @libelle NVARCHAR(80), @deplacees INT;
DECLARE curseur CURSOR FOR SELECT source, cible, libelle FROM @fusions;

OPEN curseur;
FETCH NEXT FROM curseur INTO @source, @cible, @libelle;

WHILE @@FETCH_STATUS = 0
BEGIN
    /* Les deux categories doivent exister, et partager leur scope : fusionner
       au travers d'un scope deplacerait un poste d'un perimetre a l'autre. */
    IF EXISTS (SELECT 1 FROM ref_categories a JOIN ref_categories b ON b.id = @cible
               WHERE a.id = @source AND a.scope_id = b.scope_id)
    BEGIN
        UPDATE ref_carbon_references SET category_id = @cible WHERE category_id = @source;
        SET @deplacees = @@ROWCOUNT;

        DELETE FROM ref_categories WHERE id = @source;

        PRINT CONCAT(@libelle, ' : ', @deplacees, ' reference(s) deplacee(s), jumelle supprimee.');
    END
    ELSE
    BEGIN
        PRINT CONCAT(@libelle, ' : rien a faire.');
    END

    FETCH NEXT FROM curseur INTO @source, @cible, @libelle;
END

CLOSE curseur;
DEALLOCATE curseur;

PRINT '--- APRES ---';
SELECT c.id, c.scope_id, COUNT(cr.id) AS refs
FROM   ref_categories c
LEFT   JOIN ref_carbon_references cr ON cr.category_id = c.id
WHERE  c.id IN (SELECT cible FROM @fusions)
GROUP  BY c.id, c.scope_id
ORDER  BY c.id;

PRINT '--- CONTROLE : categories restantes par scope ---';
SELECT scope_id, COUNT(*) AS categories FROM ref_categories GROUP BY scope_id ORDER BY scope_id;
GO
