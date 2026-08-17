package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.EmissionFactor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EmissionFactorRepository extends JpaRepository<EmissionFactor, Long> {

    // 1. Recherche par nom de catégorie (via la relation CarbonReference -> Category)
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "ef.carbonReference.category.name = :categoryName AND " +
            "(:dataType IS NULL OR ef.dataType = :dataType)")
    List<EmissionFactor> findByCategoryNameAndDataType(
            @Param("categoryName") String categoryName,
            @Param("dataType") String dataType
    );

    // 2. Recherche par code de Scope (ex: SCOPE_1 via CarbonReference -> Category -> Scope)
    @Query("SELECT ef FROM EmissionFactor ef WHERE ef.carbonReference.category.scope.code = :scopeCode")
    List<EmissionFactor> findByScopeCode(@Param("scopeCode") String scopeCode);

    // 3. Recherche directe par ID de CarbonReference
    List<EmissionFactor> findByCarbonReferenceId(Long carbonReferenceId);

    // --- Résolution pour l'import en masse ---

    /** Correspondance exacte sur le code du référentiel (ex. MS1COC), la plus fiable. */
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "UPPER(ef.carbonReference.referenceCode) = UPPER(:code) AND " +
            "(:dataType IS NULL OR ef.dataType = :dataType) " +
            "ORDER BY ef.referenceYear DESC")
    List<EmissionFactor> findByReferenceCode(@Param("code") String code,
                                            @Param("dataType") String dataType);

    /** Correspondance sur le nom de catégorie, insensible à la casse. */
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "UPPER(ef.carbonReference.category.name) = UPPER(:name) AND " +
            "(:dataType IS NULL OR ef.dataType = :dataType) " +
            "ORDER BY ef.referenceYear DESC")
    List<EmissionFactor> findByCategoryNameExact(@Param("name") String name,
                                                 @Param("dataType") String dataType);

    /** Repli approximatif : le libellé du type contient le terme recherché. */
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "UPPER(ef.carbonReference.typeName) LIKE UPPER(CONCAT('%', :terme, '%')) AND " +
            "(:dataType IS NULL OR ef.dataType = :dataType) " +
            "ORDER BY ef.referenceYear DESC")
    List<EmissionFactor> findByTypeNameContaining(@Param("terme") String terme,
                                                  @Param("dataType") String dataType);

    /**
     * Repli de dernier recours, sans passer par le référentiel : les requêtes
     * ci-dessus traversent {@code carbonReference} en jointure interne et sont
     * donc aveugles aux facteurs dont {@code carbon_reference_id} est NULL. Tant
     * que le référentiel carbone n'est pas rattaché, seul ce repli permet de
     * valoriser un import.
     */
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "UPPER(ef.unit) = UPPER(:unite) AND " +
            "(:dataType IS NULL OR ef.dataType = :dataType) " +
            "ORDER BY ef.referenceYear DESC, ef.id ASC")
    List<EmissionFactor> findByUnitOnly(@Param("unite") String unite,
                                        @Param("dataType") String dataType);

    /** Repli monétaire : premier facteur libellé dans la devise demandée. */
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "UPPER(ef.currency) = UPPER(:devise) AND ef.dataType = 'MONETAIRE' " +
            "ORDER BY ef.referenceYear DESC, ef.id ASC")
    List<EmissionFactor> findByCurrencyOnly(@Param("devise") String devise);

    // 4. Recherche flexible
    @Query("SELECT ef FROM EmissionFactor ef WHERE " +
            "(:category IS NULL OR ef.carbonReference.category.name = :category) AND " +
            "(:dataType IS NULL OR ef.dataType = :dataType)")
    List<EmissionFactor> searchFactorsFlexible(
            @Param("category") String category,
            @Param("dataType") String dataType
    );
}