package com.misfat.emissionservice.service;

import com.misfat.emissionservice.entity.EmissionFactor;
import com.misfat.emissionservice.repository.EmissionFactorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class EmissionFactorService {

    @Autowired
    private EmissionFactorRepository repository;

    public List<EmissionFactor> getAllFactors() {
        return repository.findAll();
    }

    public Optional<EmissionFactor> getFactorById(Long id) {
        return repository.findById(id);
    }

    public List<EmissionFactor> searchFactors(String category, String emissionSource, String dataType) {
        // Adapté au nouveau schéma : recherche flexible par nom de catégorie et type
        return repository.searchFactorsFlexible(category, dataType);
    }

    @Transactional
    public EmissionFactor createFactor(EmissionFactor factor) {
        if (factor.getGasDetails() != null) {
            factor.getGasDetails().forEach(detail -> detail.setEmissionFactor(factor));
        }
        return repository.save(factor);
    }

    @Transactional
    public Optional<EmissionFactor> updateFactor(Long id, EmissionFactor updatedFactor) {
        return repository.findById(id).map(existingFactor -> {
            // Repositionnement sur la relation CarbonReference
            existingFactor.setCarbonReference(updatedFactor.getCarbonReference());

            existingFactor.setDataType(updatedFactor.getDataType());
            existingFactor.setDatabaseSource(updatedFactor.getDatabaseSource());
            existingFactor.setFactorValue(updatedFactor.getFactorValue());
            existingFactor.setUnit(updatedFactor.getUnit());
            existingFactor.setCurrency(updatedFactor.getCurrency());
            existingFactor.setReferenceYear(updatedFactor.getReferenceYear());
            existingFactor.setHasMargins(updatedFactor.getHasMargins());

            if (updatedFactor.getGasDetails() != null) {
                existingFactor.getGasDetails().clear();
                updatedFactor.getGasDetails().forEach(detail -> {
                    detail.setEmissionFactor(existingFactor);
                    existingFactor.getGasDetails().add(detail);
                });
            }
            return repository.save(existingFactor);
        });
    }

    @Transactional
    public boolean deleteFactor(Long id) {
        return repository.findById(id).map(factor -> {
            repository.delete(factor);
            return true;
        }).orElse(false);
    }

    public List<EmissionFactor> getFactorsByCategory(String category) {
        return repository.findByCategoryNameAndDataType(category, null);
    }
}