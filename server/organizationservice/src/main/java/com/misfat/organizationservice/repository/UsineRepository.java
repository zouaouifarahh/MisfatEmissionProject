package com.misfat.organizationservice.repository;

import com.misfat.organizationservice.entity.Usine;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UsineRepository extends JpaRepository<Usine, Long> {
    List<Usine> findByFilialeId(Long filialeId);
}