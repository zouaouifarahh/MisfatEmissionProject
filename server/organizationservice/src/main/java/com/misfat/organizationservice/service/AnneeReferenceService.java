package com.misfat.organizationservice.service;

import com.misfat.organizationservice.dto.AnneeReferenceDTO;
import com.misfat.organizationservice.entity.AnneeReference;
import com.misfat.organizationservice.repository.AnneeReferenceRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Service
public class AnneeReferenceService {

    private static final String STATUT_EN_COURS = "EN_COURS";
    private static final String STATUT_CLOTUREE = "CLOTUREE";

    @Autowired
    private AnneeReferenceRepository anneeReferenceRepository;

    /** Exercices triés par ordre chronologique : l'appelant retient souvent le dernier. */
    public List<AnneeReferenceDTO> getAllAnnees() {
        return anneeReferenceRepository.findAll().stream()
                .sorted(Comparator.comparing(AnneeReference::getValeur))
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    /**
     * Ouvre un nouvel exercice carbone.
     *
     * <p>La valeur est contrôlée avant insertion : la colonne porte une
     * contrainte d'unicité, et un doublon remonterait autrement en erreur
     * technique illisible pour l'utilisateur.</p>
     *
     * <p>Ouvrir un exercice clôture le précédent : deux exercices en cours
     * rendraient indéterminée l'année retenue par défaut au démarrage.</p>
     */
    @Transactional
    public AnneeReferenceDTO createAnnee(AnneeReferenceDTO dto) {
        Integer valeur = dto.getValeur();
        if (valeur == null || valeur < 2000 || valeur > 2100) {
            throw new IllegalArgumentException("L'année doit être comprise entre 2000 et 2100.");
        }
        if (anneeReferenceRepository.findByValeur(valeur).isPresent()) {
            throw new IllegalArgumentException("L'exercice " + valeur + " existe déjà.");
        }

        String statut = dto.getStatut() != null ? dto.getStatut() : STATUT_EN_COURS;
        if (STATUT_EN_COURS.equals(statut)) {
            anneeReferenceRepository.findAll().stream()
                    .filter(a -> STATUT_EN_COURS.equals(a.getStatut()))
                    .forEach(a -> {
                        a.setStatut(STATUT_CLOTUREE);
                        anneeReferenceRepository.save(a);
                    });
        }

        AnneeReference annee = new AnneeReference();
        annee.setValeur(valeur);
        annee.setStatut(statut);
        return toDTO(anneeReferenceRepository.save(annee));
    }

    public AnneeReferenceDTO cloturerAnnee(Long id) {
        AnneeReference annee = anneeReferenceRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Année introuvable: " + id));
        annee.setStatut(STATUT_CLOTUREE);
        return toDTO(anneeReferenceRepository.save(annee));
    }

    /** Rouvre un exercice clôturé, en clôturant celui qui était en cours. */
    @Transactional
    public AnneeReferenceDTO rouvrirAnnee(Long id) {
        AnneeReference annee = anneeReferenceRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Année introuvable: " + id));

        anneeReferenceRepository.findAll().stream()
                .filter(a -> STATUT_EN_COURS.equals(a.getStatut()) && !a.getId().equals(id))
                .forEach(a -> {
                    a.setStatut(STATUT_CLOTUREE);
                    anneeReferenceRepository.save(a);
                });

        annee.setStatut(STATUT_EN_COURS);
        return toDTO(anneeReferenceRepository.save(annee));
    }

    public void supprimerAnnee(Long id) {
        if (!anneeReferenceRepository.existsById(id)) {
            throw new NoSuchElementException("Année introuvable: " + id);
        }
        anneeReferenceRepository.deleteById(id);
    }

    private AnneeReferenceDTO toDTO(AnneeReference annee) {
        AnneeReferenceDTO dto = new AnneeReferenceDTO();
        dto.setId(annee.getId());
        dto.setValeur(annee.getValeur());
        dto.setStatut(annee.getStatut());
        return dto;
    }
}