cmake_minimum_required(VERSION 3.16)

project(ndi_receiver VERSION 0.1.0 LANGUAGES CXX)

option(RECEIVER_ALLOW_STUB_BACKEND "Allow building without the NDI SDK and SDL2" ON)
set(NDI_SDK_DIR "" CACHE PATH "Path to the locally installed NDI SDK")

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(SDL2 QUIET)
find_path(
  NDI_INCLUDE_DIR
  NAMES Processing.NDI.Lib.h
  HINTS
    ${NDI_SDK_DIR}
    ENV NDI_SDK_DIR
  PATH_SUFFIXES Include include
)
find_library(
  NDI_LIBRARY
  NAMES ndi
  HINTS
    ${NDI_SDK_DIR}
    ENV NDI_SDK_DIR
  PATH_SUFFIXES Lib/aarch64-linux-gnu Lib/arm64 lib
)

if(NDI_INCLUDE_DIR AND NDI_LIBRARY)
  message(STATUS "NDI SDK detected")
  set(HAVE_NDI_SDK ON)
else()
  if(RECEIVER_ALLOW_STUB_BACKEND)
    message(WARNING "NDI SDK missing. Building stub backend only. Production builds should set -DNDI_SDK_DIR=/path/to/ndi_sdk.")
    set(HAVE_NDI_SDK OFF)
  else()
    message(FATAL_ERROR "NDI SDK not found. Set -DNDI_SDK_DIR=/path/to/ndi_sdk or enable -DRECEIVER_ALLOW_STUB_BACKEND=ON for a stub build.")
  endif()
endif()

if(SDL2_FOUND)
  message(STATUS "SDL2 detected")
  set(HAVE_SDL2 ON)
else()
  if(RECEIVER_ALLOW_STUB_BACKEND)
    message(WARNING "SDL2 missing. Building headless renderer fallback.")
    set(HAVE_SDL2 OFF)
  else()
    message(FATAL_ERROR "SDL2 not found. Install libsdl2-dev or enable -DRECEIVER_ALLOW_STUB_BACKEND=ON.")
  endif()
endif()

set(RECEIVER_SOURCES
  src/main.cpp
  src/cli.cpp
  src/logger.cpp
  src/status_writer.cpp
  src/receiver_app.cpp
  src/ndi/ndi_stub_backend.cpp
  src/render/renderer.cpp
)

if(HAVE_NDI_SDK)
  list(APPEND RECEIVER_SOURCES src/ndi/ndi_sdk_backend.cpp)
endif()

add_executable(ndi-receiver ${RECEIVER_SOURCES})
target_include_directories(ndi-receiver PRIVATE src)
target_compile_features(ndi-receiver PRIVATE cxx_std_17)

if(HAVE_NDI_SDK)
  target_compile_definitions(ndi-receiver PRIVATE NDI_SDK_AVAILABLE=1)
  target_include_directories(ndi-receiver PRIVATE ${NDI_INCLUDE_DIR})
  target_link_libraries(ndi-receiver PRIVATE ${NDI_LIBRARY})
endif()

if(HAVE_SDL2)
  target_compile_definitions(ndi-receiver PRIVATE HAVE_SDL2=1)
  target_link_libraries(ndi-receiver PRIVATE SDL2::SDL2)
endif()

enable_testing()
add_executable(receiver-tests
  tests/status_writer_test.cpp
  src/cli.cpp
  src/logger.cpp
  src/status_writer.cpp
)
target_include_directories(receiver-tests PRIVATE src)
add_test(NAME receiver-tests COMMAND receiver-tests)
