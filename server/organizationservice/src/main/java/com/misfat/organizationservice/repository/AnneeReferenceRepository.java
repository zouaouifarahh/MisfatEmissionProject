package com.misfat.organizationservice.repository;

import com.misfat.organizationservice.entity.AnneeReference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AnneeReferenceRepository extends JpaRepository<AnneeReference, Long> {

    /** La valeur d'exercice est unique : elle sert de clé métier. */
    Optional<AnneeReference> findByValeur(Integer valeur);
}
