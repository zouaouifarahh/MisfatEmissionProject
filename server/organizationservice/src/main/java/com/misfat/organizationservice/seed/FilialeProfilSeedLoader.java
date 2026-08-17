package com.misfat.organizationservice.seed;

import com.misfat.organizationservice.entity.Filiale;
import com.misfat.organizationservice.repository.FilialeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Renseigne le pays, la devise et la date de création des sociétés du groupe.
 *
 * <p>Ces trois colonnes ont été ajoutées après la mise en service :
 * {@code ddl-auto=update} les crée vides sur les lignes existantes. Le pays et
 * la devise pilotant le drapeau et la valorisation monétaire du tableau de
 * bord, les laisser nuls ferait basculer l'affichage sur des valeurs par
 * défaut trompeuses.</p>
 *
 * <p>Le chargeur ne réécrit jamais une valeur déjà saisie : une correction faite
 * depuis l'écran de gestion des sociétés survit aux redémarrages.</p>
 */
@Component
public class FilialeProfilSeedLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FilialeProfilSeedLoader.class);

    /** Profil de référence des cinq sociétés, indexé sur le code société. */
    private static final Map<String, Profil> PROFILS = Map.of(
            "MT", new Profil("MISFAT TUNISIE", "Tunisie", "TND", LocalDate.of(1993, 1, 1)),
            "MM", new Profil("MISFAT MAROC", "Maroc", "MAD", LocalDate.of(2010, 1, 1)),
            "SF", new Profil("SOLAUFIL FRANCE", "France", "EUR", LocalDate.of(2008, 1, 1)),
            "ST", new Profil("SOLAUFIL TUNISIE", "Tunisie", "TND", LocalDate.of(2012, 1, 1)),
            "AZ", new Profil("AZUR TUNISIE", "Tunisie", "TND", LocalDate.of(2015, 1, 1))
    );

    private final FilialeRepository filialeRepository;

    public FilialeProfilSeedLoader(FilialeRepository filialeRepository) {
        this.filialeRepository = filialeRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<Filiale> filiales = filialeRepository.findAll();
        int completees = 0;

        for (Filiale filiale : filiales) {
            Profil profil = PROFILS.get(filiale.getCode());
            if (profil == null) {
                continue;
            }

            boolean modifiee = false;
            if (estVide(filiale.getPays())) {
                filiale.setPays(profil.pays());
                modifiee = true;
            }
            if (estVide(filiale.getDevise())) {
                filiale.setDevise(profil.devise());
                modifiee = true;
            }
            if (filiale.getDateCreation() == null) {
                filiale.setDateCreation(profil.dateCreation());
                modifiee = true;
            }
            // Le libellé de référence corrige les appellations héritées.
            if (!profil.libelle().equals(filiale.getLibelle())) {
                filiale.setLibelle(profil.libelle());
                modifiee = true;
            }

            if (modifiee) {
                filialeRepository.save(filiale);
                completees++;
            }
        }

        if (completees > 0) {
            log.info("Profil (pays, devise, date) complété pour {} société(s).", completees);
        }
    }

    private boolean estVide(String valeur) {
        return valeur == null || valeur.isBlank();
    }

    private record Profil(String libelle, String pays, String devise, LocalDate dateCreation) {
    }
}
