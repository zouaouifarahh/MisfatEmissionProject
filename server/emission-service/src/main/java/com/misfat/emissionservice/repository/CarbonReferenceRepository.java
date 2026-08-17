package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.CarbonReference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CarbonReferenceRepository extends JpaRepository<CarbonReference, Long> {

    Optional<CarbonReference> findByReferenceCode(String referenceCode);

    // Récupérer toutes les références appartenant à un Scope particulier
    List<CarbonReference> findByCategoryScopeId(Long scopeId);

    @Query("SELECT DISTINCT c.typeName FROM CarbonReference c WHERE c.typeName IS NOT NULL ORDER BY c.typeName ASC")
    List<String> findDistinctTypes();
}