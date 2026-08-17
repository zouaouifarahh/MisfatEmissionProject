package com.misfat.dataimportservice.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * Traduit les exceptions métier en réponses HTTP homogènes pour le front et la
 * gateway.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(ResourceNotFoundException ex) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(DuplicateResourceException.class)
    public ResponseEntity<Map<String, Object>> handleDuplicate(DuplicateResourceException ex) {
        return build(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /**
     * Corps de requête que Jackson ne sait pas lire (JSON malformé, mauvais
     * encodage, valeur d'enum inconnue). Sans ce handler, Spring renvoie la
     * stack trace complète au client.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleMalformedBody(HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "Corps de requête illisible : JSON invalide ou mal encodé (UTF-8 attendu)");
    }

    /** Fichier illisible : 422, la requête est correcte mais le contenu inexploitable. */
    @ExceptionHandler(ExcelParsingException.class)
    public ResponseEntity<Map<String, Object>> handleExcelParsing(ExcelParsingException ex) {
        return build(HttpStatus.UNPROCESSABLE_CONTENT, ex.getMessage());
    }

    /** Aval indisponible ou en erreur : 502, la faute n'est pas au client. */
    @ExceptionHandler(EmissionServiceException.class)
    public ResponseEntity<Map<String, Object>> handleEmissionService(EmissionServiceException ex) {
        return build(HttpStatus.BAD_GATEWAY, ex.getMessage());
    }

    /** Filet de sécurité : aucune exception ne doit exposer sa stack trace. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne du service d'import");
    }

    /** Détaille les violations de validation champ par champ. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> champs = new TreeMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(erreur -> champs.put(erreur.getField(), erreur.getDefaultMessage()));

        ResponseEntity<Map<String, Object>> reponse = build(HttpStatus.BAD_REQUEST, "Requête invalide");
        Map<String, Object> corps = new LinkedHashMap<>(reponse.getBody());
        corps.put("fieldErrors", champs);
        return ResponseEntity.badRequest().body(corps);
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus statut, String message) {
        Map<String, Object> corps = new LinkedHashMap<>();
        corps.put("timestamp", LocalDateTime.now());
        corps.put("status", statut.value());
        corps.put("error", statut.getReasonPhrase());
        corps.put("message", message);
        return ResponseEntity.status(statut).body(corps);
    }
}
