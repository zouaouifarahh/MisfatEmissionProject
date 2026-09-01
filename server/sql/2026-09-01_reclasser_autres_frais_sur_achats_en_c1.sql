/* ============================================================================
   Reclassement de « Autres frais sur achats » de C8 vers C1
   ----------------------------------------------------------------------------
   Second volet du reclassement engage la veille sur « Achats matieres
   premieres etrangers ». Meme defaut, meme regle : des frais sur achats etaient
   rattaches au facteur MS3C8MN — « Leased asset, monetary approach » — donc a
   la categorie 8 du Scope 3, « Actifs loues en amont ». Des frais sur achats ne
   sont pas un actif loue : ils relevent de la categorie 1, « Biens et services
   achetes », ou l'import range deja « Frais/achat autres fournitures cons ».

   Le facteur retenu est MS3C1CP, celui que l'import applique par defaut a
   dix-sept des vingt-trois lignes de la categorie 1. C'est la regle de la
   maison, appliquee a une ligne qui aurait du l'etre des l'origine.

   CONSEQUENCE CHIFFREE, a lire avant d'executer :
     avant  743 170,243 x 0,55 (valeur enregistree)  = 408 744 kgCO2e
     apres  743 170,243 x 0,1010948036               =  75 130 kgCO2e
     ecart                                             -333 614 kgCO2e
   L'empreinte 2025 passe donc d'environ 16 326 t a 15 992 t, et la categorie 8
   tombe a zero : plus aucune mesure n'y subsiste.

   La valeur enregistree (0,55 kgCO2e/TND) ne correspond pas au facteur
   MS3C8MN rattache (0,18), et l'ecart n'est pas celui observe sur la mesure 8
   (0,235) : ce n'est donc pas une conversion de devise unique. L'origine de ces
   totaux n'est pas documentee ; le nouveau total est recalcule simplement,
   quantite x facteur, plutot que de reconduire un ecart qu'on ne sait pas
   expliquer.

   La mesure est designee par son identifiant et non par son libelle : celui-ci
   ne porte pas d'accent ici, mais sqlcmd lit le fichier dans la page de codes
   du systeme, et s'en remettre a cette chance serait le meme piege que la
   veille — le script avait alors annonce zero ligne sans rien reclasser.

   Idempotent : la garde sur MS3C8MN fait qu'une mesure deja reclassee n'est
   plus retenue. Relance sans effet.
   ============================================================================ */

USE MisfatDB;
GO

SET NOCOUNT ON;
GO

DECLARE @mesure BIGINT       = 10;
DECLARE @refC1  NVARCHAR(60) = N'MS3C1CP';
DECLARE @refC8  NVARCHAR(60) = N'MS3C8MN';

DECLARE @facteurC1 BIGINT;
DECLARE @valeurC1  DECIMAL(18, 10);

SELECT TOP 1 @facteurC1 = ef.id, @valeurC1 = ef.factor_value
FROM   emission_factor ef
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
WHERE  cr.reference_code = @refC1
  AND  ef.unit = 'TND'
ORDER  BY ef.id;

IF @facteurC1 IS NULL
BEGIN
    RAISERROR('Facteur %s introuvable en TND : reclassement abandonne.', 16, 1, @refC1);
    RETURN;
END

PRINT '--- AVANT ---';
SELECT m.id, m.label, cr.reference_code, c.name AS categorie,
       m.quantity, m.total_co2e
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
JOIN   ref_categories c ON c.id = cr.category_id
WHERE  m.id = @mesure;

UPDATE m
SET    m.emission_factor_id = @facteurC1,
       m.total_co2e         = m.quantity * @valeurC1,
       m.category_code      = 'Category 1: Purchased goods and services'
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
WHERE  m.id = @mesure
  AND  cr.reference_code = @refC8;

PRINT CONCAT('Lignes reclassees : ', @@ROWCOUNT);

PRINT '--- APRES ---';
SELECT m.id, m.label, cr.reference_code, c.name AS categorie,
       m.quantity, m.total_co2e
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
JOIN   ref_categories c ON c.id = cr.category_id
WHERE  m.id = @mesure;

/* -- Controle : ce qui subsiste sous la categorie 8 ------------------------- */
PRINT '--- CONTROLE : mesures restant en categorie 8 ---';
SELECT m.id, m.label, m.total_co2e
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
JOIN   ref_categories c ON c.id = cr.category_id
WHERE  c.name LIKE 'Category 8:%';
GO
