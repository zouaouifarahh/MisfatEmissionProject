package com.misfat.dataimportservice.repository;

import com.misfat.dataimportservice.entity.ImportSourceType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ImportSourceTypeRepository extends JpaRepository<ImportSourceType, Long> {

    Optional<ImportSourceType> findByCodeName(String codeName);

    boolean existsByCodeName(String codeName);

    /** Utile pour valider l'unicité en modification sans se heurter à soi-même. */
    boolean existsByCodeNameAndIdNot(String codeName, Long id);

    List<ImportSourceType> findByActiveTrueOrderByDisplayNameAsc();

    List<ImportSourceType> findByActiveTrueAndScopeTargetOrderByDisplayNameAsc(String scopeTarget);
}
