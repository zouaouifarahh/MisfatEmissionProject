package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.dto.MesureAgregatRow;
import com.misfat.emissionservice.entity.EmissionMeasure;
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
}