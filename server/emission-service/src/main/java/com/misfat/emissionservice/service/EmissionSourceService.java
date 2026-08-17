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