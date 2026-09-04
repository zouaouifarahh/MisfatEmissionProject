package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.EmissionSource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EmissionSourceRepository extends JpaRepository<EmissionSource, Long> {

    // Pour filtrer les sources par catégorie dans les formulaires de saisie
    List<EmissionSource> findByCategory(String category);

    // Pour filtrer par scope
    List<EmissionSource> findByScope(String scope);

    java.util.Optional<com.misfat.emissionservice.entity.EmissionSource> findByReferenceCode(String referenceCode);

    /**
     * Source portant ce code, quelle que soit la casse.
     *
     * <p>« MS1GPL » et « ms1gpl » désignent la même référence pour qui la
     * saisit : les distinguer laisserait entrer deux fois le même facteur, que
     * plus rien ne départagerait ensuite dans les menus de saisie.</p>
     */
    java.util.Optional<com.misfat.emissionservice.entity.EmissionSource>
        findFirstByReferenceCodeIgnoreCase(String referenceCode);

}