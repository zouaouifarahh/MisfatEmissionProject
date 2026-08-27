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

    /**
     * Enregistre un nouveau facteur, toujours sous un identifiant neuf.
     *
     * <p>L'identifiant reçu est écarté. {@code save()} distingue l'insertion de
     * la mise à jour sur ce seul champ : un corps de requête qui porterait l'id
     * d'un facteur existant — copié d'une variante affichée, rejoué depuis un
     * outil de test — deviendrait un UPDATE et écraserait la valeur en place.
     * Une création ne doit jamais pouvoir effacer une donnée ; la mise à jour a
     * sa propre route, où l'identifiant est explicite dans l'URL.</p>
     */
    @Transactional
    public EmissionFactor createFactor(EmissionFactor factor) {
        factor.setId(null);

        if (factor.getGasDetails() != null) {
            factor.getGasDetails().forEach(detail -> {
                detail.setId(null);
                detail.setEmissionFactor(factor);
            });
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

            // Incertitude et validité étaient omises : la saisie pouvait les
            // modifier à l'écran sans que rien ne soit enregistré. Ce sont
            // pourtant elles qui disent ce que vaut le facteur et jusqu'à quand.
            existingFactor.setUncertaintyPercent(updatedFactor.getUncertaintyPercent());
            existingFactor.setValidityLabel(updatedFactor.getValidityLabel());

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