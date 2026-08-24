package com.plutoshop.api.error;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class ApiExceptionHandler {

    private static final URI ABOUT_BLANK = URI.create("about:blank");
    private static final String INVALID_PARAMETERS_TITLE = "Invalid request parameters";

    @ExceptionHandler(InvalidRequestParameterException.class)
    ResponseEntity<SanitizedProblemDetail> handleInvalidRequestParameter(
            InvalidRequestParameterException exception) {
        return badRequest(exception.getMessage());
    }

    private static ResponseEntity<SanitizedProblemDetail> badRequest(String detail) {
        SanitizedProblemDetail problem = new SanitizedProblemDetail(
                ABOUT_BLANK,
                INVALID_PARAMETERS_TITLE,
                HttpStatus.BAD_REQUEST.value(),
                detail);

        return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    private record SanitizedProblemDetail(URI type, String title, int status, String detail) {
    }
}
