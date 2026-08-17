package com.misfat.dataimportservice.client;

import com.misfat.dataimportservice.dto.RawImportRowDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * Appel de {@code emission-service} pour le calcul et la persistance des mesures.
 *
 * <p>La cible est le nom d'application enregistré dans Eureka : l'appel est donc
 * équilibré entre instances et ne traverse pas la gateway, qui n'a pas à router
 * du trafic interne.</p>
 *
 * <p>Le corps de réponse est vide ; l'issue se lit dans le statut HTTP : 201
 * pour un import complet, 207 pour un import partiel, 422 si aucune ligne n'a
 * pu être exploitée. Les en-têtes {@code X-Imported-Count},
 * {@code X-Skipped-Count} et {@code X-Skipped-Reasons} portent le détail.</p>
 */
@FeignClient(name = "emission-service")
public interface EmissionServiceClient {

    @PostMapping("/api/v1/emissions/bulk-import")
    ResponseEntity<Void> bulkImportEmissions(@RequestBody List<RawImportRowDto> dtoList,
                                             @RequestParam("importLogId") Long importLogId);
}
