package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.ReferentialImportLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReferentialImportLogRepository extends JpaRepository<ReferentialImportLog, Long> {

    List<ReferentialImportLog> findAllByOrderByImportDateDesc();

    /**
     * Dépôts d'une société pour un exercice.
     *
     * <p>Les deux critères vont ensemble : filtrer sur la seule société
     * mélangerait les exercices d'un même site, et un dépôt de 2025 remonterait
     * dans l'historique de 2026.</p>
     */
    List<ReferentialImportLog> findByFilialeIdAndAnneeOrderByImportDateDesc(Long filialeId, Integer annee);

    /** Tous les exercices d'une société, quand aucune année n'est arrêtée. */
    List<ReferentialImportLog> findByFilialeIdOrderByImportDateDesc(Long filialeId);

    /** Toutes les sociétés d'un exercice : la vue Groupe sur une année donnée. */
    List<ReferentialImportLog> findByAnneeOrderByImportDateDesc(Integer annee);
}
