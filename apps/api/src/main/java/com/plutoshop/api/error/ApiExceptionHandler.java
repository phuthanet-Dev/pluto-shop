package com.plutoshop.api.error;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.plutoshop.api.admin.AdminProductConflictException;
import com.plutoshop.api.admin.AdminProductNotFoundException;

@RestControllerAdvice
class ApiExceptionHandler {

    private static final URI ABOUT_BLANK = URI.create("about:blank");
    private static final String INVALID_PARAMETERS_TITLE = "Invalid request parameters";

    @ExceptionHandler(InvalidRequestParameterException.class)
    ResponseEntity<SanitizedProblemDetail> handleInvalidRequestParameter(
            InvalidRequestParameterException exception) {
        return problem(HttpStatus.BAD_REQUEST, INVALID_PARAMETERS_TITLE, exception.getMessage());
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    ResponseEntity<SanitizedProblemDetail> handleMalformedRequest(Exception exception) {
        return problem(HttpStatus.BAD_REQUEST, INVALID_PARAMETERS_TITLE, "Request validation failed");
    }

    @ExceptionHandler(AdminProductConflictException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminConflict(AdminProductConflictException exception) {
        return problem(HttpStatus.CONFLICT, "Product conflict", exception.getMessage());
    }

    @ExceptionHandler(AdminProductNotFoundException.class)
    ResponseEntity<SanitizedProblemDetail> handleAdminNotFound(AdminProductNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Product not found", exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<SanitizedProblemDetail> handleDataIntegrityConflict(DataIntegrityViolationException exception) {
        return problem(HttpStatus.CONFLICT, "Product conflict", "Product constraint conflict");
    }

    private static ResponseEntity<SanitizedProblemDetail> problem(
            HttpStatus status,
            String title,
            String detail) {
        SanitizedProblemDetail problem = new SanitizedProblemDetail(
                ABOUT_BLANK,
                title,
                status.value(),
                detail);

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    private record SanitizedProblemDetail(URI type, String title, int status, String detail) {
    }
}
