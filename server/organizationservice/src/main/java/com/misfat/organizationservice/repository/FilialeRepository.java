package com.misfat.organizationservice.repository;

import com.misfat.organizationservice.entity.Filiale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface FilialeRepository extends JpaRepository<Filiale, Long> {

    /** Le code société est unique : il sert de clé métier au CRUD. */
    Optional<Filiale> findByCode(String code);
}
