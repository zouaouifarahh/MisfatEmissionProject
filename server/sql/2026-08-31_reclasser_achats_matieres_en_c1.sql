/* ============================================================================
   Reclassement de « Achats matières premières étrangers » de C8 vers C1
   ----------------------------------------------------------------------------
   La ligne pèse 118 882 142,36 TND et se trouvait rattachée au facteur
   MS3C8MN — « Leased asset, monetary approach » —, donc à la catégorie 8 du
   Scope 3, « Actifs loués en amont ». Un achat de matières premières n'est pas
   un actif loué : il relève de la catégorie 1, « Biens et services achetés ».
   Le classement faisait porter 87 % de l'empreinte 2025 à un poste que
   l'entreprise ne loue pas.

   Le facteur retenu est MS3C1CP (0,1010948036 kgCO2e/TND), celui que l'import
   applique déjà par défaut à dix-sept des vingt-trois lignes de la catégorie 1.
   Ce n'est pas un choix arbitraire : c'est la règle de la maison, appliquée à
   une ligne qui aurait dû l'être dès l'origine.

   CONSÉQUENCE CHIFFRÉE, à lire avant d'exécuter :
     avant  118 882 142,36 x 0,235 (valeur enregistrée)  = 27 937 303 kgCO2e
     après  118 882 142,36 x 0,1010948036                = 12 017 152 kgCO2e
     écart                                                 -15 920 151 kgCO2e
   L'empreinte 2025 du groupe passe donc d'environ 32 245 t à 16 325 t. Le
   reclassement ne réduit aucune émission réelle : il corrige une valorisation
   qui appliquait un facteur d'actif loué à un achat de matières.

   La valeur enregistrée (0,235 kgCO2e/TND) ne correspond pas au facteur
   MS3C8MN rattaché (0,18) : le facteur a été révisé après l'import, ou une
   conversion de devise a été appliquée à la saisie. Le nouveau total est
   recalculé simplement, quantité x facteur, sans reconduire un écart dont
   l'origine n'est pas documentée.

   Le script est idempotent : relancé, il ne fait rien. Il ne touche qu'à la
   mesure désignée, jamais à un lot.
   ============================================================================ */

USE MisfatDB;
GO

SET NOCOUNT ON;
GO

/* La mesure est designee par son identifiant, non par son libelle : celui-ci
   porte des accents, et sqlcmd lit le fichier dans la page de codes du systeme
   — le litteral n'y survit pas, et le script ne reclassait rien en silence. */
DECLARE @mesure     BIGINT = 8;
DECLARE @refC1      NVARCHAR(60)  = N'MS3C1CP';
DECLARE @refC8      NVARCHAR(60)  = N'MS3C8MN';

/* -- Facteur de destination : le catch-all C1, en dinars ------------------- */
DECLARE @facteurC1  BIGINT;
DECLARE @valeurC1   DECIMAL(18, 10);

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

/* -- Etat avant ------------------------------------------------------------ */
PRINT '--- AVANT ---';
SELECT m.id, m.label, cr.reference_code, c.name AS categorie,
       m.quantity, m.total_co2e
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
JOIN   ref_categories c ON c.id = cr.category_id
WHERE  m.id = @mesure;

/* -- Reclassement ---------------------------------------------------------- */
/* La garde sur la référence d'origine rend le script rejouable : une mesure
   déjà reclassée ne porte plus MS3C8MN et n'est donc plus retenue.           */
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

/* -- Etat apres ------------------------------------------------------------ */
PRINT '--- APRES ---';
SELECT m.id, m.label, cr.reference_code, c.name AS categorie,
       m.quantity, m.total_co2e
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
JOIN   ref_categories c ON c.id = cr.category_id
WHERE  m.id = @mesure;

/* -- Controle : plus aucune mesure d'achat de matieres sous la categorie 8 -- */
PRINT '--- CONTROLE : achats de matieres restes en categorie 8 ---';
SELECT m.id, m.label
FROM   emission_measure m
JOIN   emission_factor ef ON ef.id = m.emission_factor_id
JOIN   ref_carbon_references cr ON cr.id = ef.carbon_reference_id
JOIN   ref_categories c ON c.id = cr.category_id
WHERE  c.name LIKE 'Category 8:%';
GO
