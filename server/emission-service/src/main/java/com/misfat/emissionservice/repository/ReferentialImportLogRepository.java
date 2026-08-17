package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.ReferentialImportLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReferentialImportLogRepository extends JpaRepository<ReferentialImportLog, Long> {

    List<ReferentialImportLog> findAllByOrderByImportDateDesc();
}
