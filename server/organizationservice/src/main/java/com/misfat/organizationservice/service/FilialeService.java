package com.misfat.organizationservice.service;

import com.misfat.organizationservice.dto.FilialeDTO;
import com.misfat.organizationservice.dto.UsineDTO;
import com.misfat.organizationservice.entity.Filiale;
import com.misfat.organizationservice.repository.FilialeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Service
public class FilialeService {

    @Autowired
    private FilialeRepository filialeRepository;

    public List<FilialeDTO> getAllFiliales() {
        return filialeRepository.findAll().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public FilialeDTO getFilialeById(Long id) {
        Filiale filiale = filialeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Filiale introuvable: " + id));
        return toDTO(filiale);
    }

    public FilialeDTO createFiliale(FilialeDTO dto) {
        String code = normaliserCode(dto.getCode());
        if (filialeRepository.findByCode(code).isPresent()) {
            throw new IllegalArgumentException("Le code société " + code + " est déjà utilisé.");
        }

        Filiale filiale = new Filiale();
        appliquer(filiale, dto, code);
        // Une société créée sans date est réputée créée aujourd'hui : le champ
        // alimente l'affichage et ne doit pas rester vide.
        if (filiale.getDateCreation() == null) {
            filiale.setDateCreation(LocalDate.now());
        }
        return toDTO(filialeRepository.save(filiale));
    }

    public FilialeDTO updateFiliale(Long id, FilialeDTO dto) {
        Filiale filiale = filialeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Filiale introuvable: " + id));

        String code = normaliserCode(dto.getCode());
        filialeRepository.findByCode(code)
                .filter(existante -> !existante.getId().equals(id))
                .ifPresent(existante -> {
                    throw new IllegalArgumentException("Le code société " + code + " est déjà utilisé.");
                });

        appliquer(filiale, dto, code);
        return toDTO(filialeRepository.save(filiale));
    }

    /**
     * Supprime une société.
     *
     * @throws IllegalStateException si des usines lui sont encore rattachées ;
     *         la cascade les effacerait silencieusement avec elle
     */
    public void deleteFiliale(Long id) {
        Filiale filiale = filialeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Filiale introuvable: " + id));

        if (filiale.getUsines() != null && !filiale.getUsines().isEmpty()) {
            throw new IllegalStateException(
                    "Suppression impossible : " + filiale.getUsines().size()
                            + " usine(s) sont rattachées à cette société.");
        }
        filialeRepository.delete(filiale);
    }

    private void appliquer(Filiale filiale, FilialeDTO dto, String code) {
        filiale.setCode(code);
        filiale.setLibelle(dto.getLibelle() == null ? null : dto.getLibelle().trim());
        filiale.setLibelleCegid(dto.getLibelleCegid());
        filiale.setCodeD365fo(dto.getCodeD365fo());
        filiale.setPays(dto.getPays() == null ? null : dto.getPays().trim());
        filiale.setDevise(dto.getDevise() == null ? null : dto.getDevise().trim().toUpperCase(Locale.ROOT));
        filiale.setDateCreation(dto.getDateCreation());
    }

    private String normaliserCode(String code) {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("Le code société est obligatoire.");
        }
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private FilialeDTO toDTO(Filiale filiale) {
        FilialeDTO dto = new FilialeDTO();
        dto.setId(filiale.getId());
        dto.setCode(filiale.getCode());
        dto.setLibelle(filiale.getLibelle());
        dto.setLibelleCegid(filiale.getLibelleCegid());
        dto.setCodeD365fo(filiale.getCodeD365fo());
        dto.setPays(filiale.getPays());
        dto.setDevise(filiale.getDevise());
        dto.setDateCreation(filiale.getDateCreation());
        dto.setNombreUsines(filiale.getUsines() == null ? 0 : filiale.getUsines().size());
        if (filiale.getUsines() != null) {
            dto.setUsines(filiale.getUsines().stream().map(u -> {
                UsineDTO uDto = new UsineDTO();
                uDto.setId(u.getId());
                uDto.setNom(u.getNom());
                uDto.setEmplacement(u.getEmplacement());
                uDto.setFilialeId(filiale.getId());
                uDto.setFilialeCode(filiale.getCode());
                return uDto;
            }).collect(Collectors.toList()));
        }
        return dto;
    }
}