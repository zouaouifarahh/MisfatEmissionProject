package com.misfat.emissionservice.service;

import com.misfat.emissionservice.entity.EmissionSource;
import com.misfat.emissionservice.repository.EmissionSourceRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class EmissionSourceService {

    @Autowired
    private EmissionSourceRepository repository;

    public List<EmissionSource> getAllSources() {
        return repository.findAll();
    }

    public List<EmissionSource> getSourcesByCategory(String category) {
        return repository.findByCategory(category);
    }

    /**
     * Code déjà porté par une autre source ?
     *
     * <p>Rien ne l'empêchait : deux sources pouvaient partager un code, et les
     * écrans de saisie proposaient alors deux entrées que rien ne distinguait,
     * pour des facteurs différents. La comparaison ignore la casse et les
     * espaces de bordure — c'est la même référence pour qui la saisit.</p>
     *
     * @param idExclu la source en cours de modification, qui conserve son
     *                propre code sans se déclarer en conflit avec elle-même.
     */
    public boolean referenceDejaPrise(String referenceCode, Long idExclu) {
        String code = referenceCode == null ? "" : referenceCode.trim();
        if (code.isEmpty()) {
            return false;
        }

        return repository.findFirstByReferenceCodeIgnoreCase(code)
                .filter(existante -> idExclu == null || !idExclu.equals(existante.getId()))
                .isPresent();
    }

    public EmissionSource saveSource(EmissionSource source) {
        return repository.save(source);
    }

    /**
     * Met à jour une source existante.
     *
     * <p>L'identifiant vient de l'URL et non du corps : un {@code save} sur un
     * corps sans id créerait une seconde ligne au lieu de modifier la première.</p>
     *
     * @throws java.util.NoSuchElementException si la source n'existe pas
     */
    public EmissionSource updateSource(Long id, EmissionSource modifications) {
        EmissionSource existante = repository.findById(id).orElseThrow();

        existante.setReferenceCode(modifications.getReferenceCode());
        existante.setScope(modifications.getScope());
        existante.setCategory(modifications.getCategory());
        existante.setSourceName(modifications.getSourceName());
        existante.setDefaultUnit(modifications.getDefaultUnit());

        return repository.save(existante);
    }

    public void deleteSource(Long id) {
        repository.deleteById(id);
    }
}