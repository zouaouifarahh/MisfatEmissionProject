package com.misfat.dataimportservice.repository;

import com.misfat.dataimportservice.entity.ImportLog;
import com.misfat.dataimportservice.entity.ImportStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface ImportLogRepository extends JpaRepository<ImportLog, Long> {

    List<ImportLog> findByFilialeIdOrderByImportDateDesc(Long filialeId);

    List<ImportLog> findByFilialeIdAndUsineIdOrderByImportDateDesc(Long filialeId, Long usineId);

    List<ImportLog> findAllByOrderByImportDateDesc();

    List<ImportLog> findByStatusOrderByImportDateDesc(ImportStatus status);

    List<ImportLog> findByImportSourceTypeIdOrderByImportDateDesc(Long importSourceTypeId);

    List<ImportLog> findByImportDateBetweenOrderByImportDateDesc(LocalDateTime debut, LocalDateTime fin);
}
