package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.dto.MesureAgregatRow;
import com.misfat.emissionservice.dto.MesurePageDto;
import com.misfat.emissionservice.entity.EmissionMeasure;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EmissionMeasureRepository extends JpaRepository<EmissionMeasure, Long> {

    // ✅ Correction : Navigation à travers carbonReference -> category -> name
    @Query("SELECT em FROM EmissionMeasure em WHERE " +
            "LOWER(em.emissionFactor.carbonReference.category.name) LIKE LOWER(CONCAT('%', :category, '%'))")
    List<EmissionMeasure> findByEmissionFactorCategoryContainingIgnoreCase(@Param("category") String category);

    /**
     * Agrégat unique servant toutes les vues du tableau de bord directeur.
     *
     * <p>Le regroupement porte sur tous les axes à la fois (scope, catégorie,
     * filiale, devise, type de facteur, année) plutôt que d'exposer une requête
     * par vue. Le {@code SUM} reste exécuté par MSSQL sur la table complète ;
     * le résultat, de l'ordre de quelques dizaines de lignes, se re-découpe
     * ensuite en mémoire pour un périmètre donné sans nouvel aller-retour.</p>
     *
     * <p>Les jointures vers la catégorie sont externes à dessein : une mesure
     * dont le facteur n'est pas rattaché au référentiel doit rester comptée,
     * sous un scope nul que l'appelant reclasse en « non classé ».</p>
     */
    @Query("""
            SELECT s.code              AS scopeCode,
                   c.name              AS categorieNom,
                   m.filialeId         AS filialeId,
                   m.currency          AS devise,
                   f.dataType          AS typeDonnee,
                   YEAR(m.measureDate) AS annee,
                   SUM(m.totalCo2e)    AS sommeCo2e,
                   SUM(m.quantity)     AS sommeQuantite,
                   COUNT(m.id)         AS nombre
            FROM EmissionMeasure m
            JOIN m.emissionFactor f
            LEFT JOIN f.carbonReference r
            LEFT JOIN r.category c
            LEFT JOIN c.scope s
            GROUP BY s.code, c.name, m.filialeId, m.currency, f.dataType, YEAR(m.measureDate)
            """)
    List<MesureAgregatRow> agregerParAxes();

    /**
     * Page de mesures d'une catégorie, cloisonnée par exercice et par société.
     *
     * <p>La pagination est faite par la base, non par le navigateur. Un écran
     * d'achats porte cent onze mille lignes sur un exercice : les transmettre
     * toutes pour n'en montrer cinquante fait payer au réseau, à la mémoire et
     * au rendu un travail que le {@code OFFSET} de MSSQL fait sans effort.</p>
     *
     * <p>Les trois critères acceptent {@code null}, qui vaut « tous ». C'est la
     * même convention que le reste de l'application : un exercice non renseigné
     * porte la vue pluriannuelle, une société non renseignée la vue groupe.</p>
     *
     * <p>Le tri est posé ici plutôt que laissé au {@link Pageable} : sans ordre
     * stable, deux pages consécutives peuvent montrer la même ligne ou en
     * omettre une, MSSQL ne garantissant aucun ordre par défaut.</p>
     */
    @Query("""
            SELECT new com.misfat.emissionservice.dto.MesurePageDto(
                       m.id, m.label, m.quantity, m.unit, m.currency, m.totalCo2e,
                       m.measureDate, CAST(m.origin AS string), m.filialeId, m.usineId,
                       r.referenceCode, f.factorValue, f.unit, f.dataType,
                       f.databaseSource, c.name)
            FROM EmissionMeasure m
            JOIN m.emissionFactor f
            LEFT JOIN f.carbonReference r
            LEFT JOIN r.category c
            WHERE (:categorie IS NULL OR LOWER(c.name) LIKE LOWER(CONCAT('%', :categorie, '%')))
              AND (:annee IS NULL OR YEAR(m.measureDate) = :annee)
              AND (:filialeId IS NULL OR m.filialeId = :filialeId)
            ORDER BY m.measureDate DESC, m.id DESC
            """)
    Page<MesurePageDto> pagerParCategorie(@Param("categorie") String categorie,
                                          @Param("annee") Integer annee,
                                          @Param("filialeId") Long filialeId,
                                          Pageable pageable);

    /**
     * Totaux d'une catégorie sur le même périmètre que la page.
     *
     * <p>Les indicateurs du haut d'écran ne peuvent pas se déduire de la page
     * affichée : cinquante lignes sur cent onze mille n'en disent rien. Ils sont
     * donc comptés par la base, sur exactement les mêmes critères — sans quoi
     * l'en-tête et le tableau raconteraient deux histoires.</p>
     */
    @Query("""
            SELECT COUNT(m.id), COALESCE(SUM(m.totalCo2e), 0), COALESCE(SUM(m.quantity), 0)
            FROM EmissionMeasure m
            JOIN m.emissionFactor f
            LEFT JOIN f.carbonReference r
            LEFT JOIN r.category c
            WHERE (:categorie IS NULL OR LOWER(c.name) LIKE LOWER(CONCAT('%', :categorie, '%')))
              AND (:annee IS NULL OR YEAR(m.measureDate) = :annee)
              AND (:filialeId IS NULL OR m.filialeId = :filialeId)
            """)
    List<Object[]> totauxParCategorie(@Param("categorie") String categorie,
                                       @Param("annee") Integer annee,
                                       @Param("filialeId") Long filialeId);
}