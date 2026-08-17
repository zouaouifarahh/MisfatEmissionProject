package com.misfat.organizationservice.service;

import com.misfat.organizationservice.dto.UsineDTO;
import com.misfat.organizationservice.entity.Filiale;
import com.misfat.organizationservice.entity.Usine;
import com.misfat.organizationservice.repository.FilialeRepository;
import com.misfat.organizationservice.repository.UsineRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class UsineService {

    @Autowired
    private UsineRepository usineRepository;

    @Autowired
    private FilialeRepository filialeRepository;

    public List<UsineDTO> getAllUsines() {
        return usineRepository.findAll().stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<UsineDTO> getUsinesByFiliale(Long filialeId) {
        return usineRepository.findByFilialeId(filialeId).stream().map(this::toDTO).collect(Collectors.toList());
    }

    public UsineDTO createUsine(UsineDTO dto) {
        Filiale filiale = filialeRepository.findById(dto.getFilialeId())
                .orElseThrow(() -> new RuntimeException("Filiale introuvable: " + dto.getFilialeId()));
        Usine usine = new Usine();
        usine.setNom(dto.getNom());
        usine.setEmplacement(dto.getEmplacement());
        usine.setFiliale(filiale);
        return toDTO(usineRepository.save(usine));
    }

    public UsineDTO updateUsine(Long id, UsineDTO dto) {
        Usine usine = usineRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usine introuvable: " + id));
        usine.setNom(dto.getNom());
        usine.setEmplacement(dto.getEmplacement());
        if (dto.getFilialeId() != null) {
            Filiale filiale = filialeRepository.findById(dto.getFilialeId())
                    .orElseThrow(() -> new RuntimeException("Filiale introuvable: " + dto.getFilialeId()));
            usine.setFiliale(filiale);
        }
        return toDTO(usineRepository.save(usine));
    }

    public void deleteUsine(Long id) {
        usineRepository.deleteById(id);
    }

    private UsineDTO toDTO(Usine usine) {
        UsineDTO dto = new UsineDTO();
        dto.setId(usine.getId());
        dto.setNom(usine.getNom());
        dto.setEmplacement(usine.getEmplacement());
        if (usine.getFiliale() != null) {
            dto.setFilialeId(usine.getFiliale().getId());
            dto.setFilialeCode(usine.getFiliale().getCode());
        }
        return dto;
    }
}