package com.misfat.emissionservice.repository;

import com.misfat.emissionservice.entity.Scope;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ScopeRepository extends JpaRepository<Scope, Long> {
    Optional<Scope> findByCode(String code);
}