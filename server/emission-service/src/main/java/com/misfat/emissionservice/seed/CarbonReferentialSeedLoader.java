package com.misfat.emissionservice.seed;

import com.misfat.emissionservice.service.CarbonReferentialImporter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Chargement du référentiel carbone au démarrage, depuis
 * « Base carbone interne.xlsx ».
 *
 * <p>La lecture est déléguée à {@link CarbonReferentialImporter}, partagé avec
 * l'import manuel : les deux chemins produisent exactement le même résultat.
 * L'opération est idempotente, un redémarrage ne duplique rien et ne charge que
 * les lignes ajoutées au fichier depuis la fois précédente.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CarbonReferentialSeedLoader {

    private static final String NOM_FICHIER = "Base carbone interne.xlsx";

    private final CarbonReferentialImporter importer;

    @Value("${misfat.seed.carbon-file:../../Base carbone interne.xlsx}")
    private String cheminFichier;

    @Value("${misfat.seed.enabled:true}")
    private boolean actif;

    @EventListener(ApplicationReadyEvent.class)
    public void charger() {
        if (!actif) {
            log.info("Seed du référentiel carbone désactivé (misfat.seed.enabled=false)");
            return;
        }

        Path fichier = resoudreFichier();
        if (fichier == null) {
            log.warn("Fichier de référentiel introuvable ({}) : seed ignoré", cheminFichier);
            return;
        }

        try (InputStream flux = Files.newInputStream(fichier)) {
            CarbonReferentialImporter.Bilan bilan = importer.importer(flux);
            log.info("Seed référentiel — {} lignes lues, {} références, {} sources, {} facteurs créés ({} erreurs)",
                    bilan.totalRows, bilan.references, bilan.sources, bilan.facteurs, bilan.erreurCount());
        } catch (Exception e) {
            log.error("Chargement du référentiel carbone impossible : {}", e.getMessage());
        }
    }

    /** Cherche le fichier au chemin configuré, puis en remontant vers la racine. */
    private Path resoudreFichier() {
        List<Path> candidats = List.of(
                Path.of(cheminFichier),
                Path.of("..", "..", NOM_FICHIER),
                Path.of("..", NOM_FICHIER),
                Path.of(NOM_FICHIER));

        for (Path candidat : candidats) {
            if (Files.isRegularFile(candidat)) {
                log.info("Référentiel carbone lu depuis {}", candidat.toAbsolutePath().normalize());
                return candidat;
            }
        }
        return null;
    }
}
