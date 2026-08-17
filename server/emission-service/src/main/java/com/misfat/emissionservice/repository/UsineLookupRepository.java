package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.EmissionMeasure;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * Résolution de la filiale portant une usine.
 *
 * <p>La table {@code usine} appartient à organization-service mais réside dans
 * la même base : une requête native suffit, là où un appel HTTP entre services
 * ajouterait une latence et un point de panne à chaque enregistrement de
 * mesure. Lecture seule, sur une seule colonne.</p>
 */
public interface UsineLookupRepository extends JpaRepository<EmissionMeasure, Long> {

    /**
     * Filiale d'une usine.
     *
     * @return la filiale, ou vide si l'usine est inconnue.
     */
    @Query(value = "SELECT filiale_id FROM usine WHERE id = :usineId", nativeQuery = true)
    Optional<Long> filialeDeLUsine(@Param("usineId") Long usineId);
}
